import { z } from "zod";
import { getEnv } from "@/lib/env";
import { log, redact } from "@/lib/log";
const meSchema = z.object({
  name: z.string(),
  wallet: z
    .union([z.number(), z.string(), z.record(z.string(), z.unknown())])
    .nullable(),
  concurrency: z
    .union([z.number(), z.record(z.string(), z.unknown())])
    .nullable(),
});
const agentSchema = z.object({
  id: z.string().min(1),
  agent_name: z.string(),
  agent_status: z.string().optional(),
  tasks: z.array(z.record(z.string(), z.json())).optional(),
  agent_prompts: z.record(z.string(), z.json()).optional(),
});
export type BolnaUser = z.infer<typeof meSchema>;
export type BolnaAgent = z.infer<typeof agentSchema>;
export interface BolnaProvider {
  getMe(): Promise<BolnaUser>;
  listAgents(): Promise<BolnaAgent[]>;
  getAgent(id: string): Promise<BolnaAgent>;
}
export class BolnaError extends Error {
  readonly body: unknown;
  constructor(
    public readonly status: number,
    body: unknown,
    secrets: string[] = [],
  ) {
    super(`Bolna request failed (HTTP ${status})`);
    this.name = "BolnaError";
    // Provider responses sometimes echo request credentials. Never retain raw bodies.
    this.body = redact(body, secrets);
  }
}
type Options = {
  apiKey: string;
  baseUrl?: string;
  timeoutMs?: number;
  maxRetries?: number;
  fetch?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
};
const retrySchema = z.object({
  retry_after_seconds: z.coerce.number().nonnegative().optional(),
});
export class BolnaClient implements BolnaProvider {
  private readonly options: Required<Options>;
  constructor(options: Options) {
    const baseUrl = z
      .url({ protocol: /^https?$/ })
      .parse(options.baseUrl ?? "https://api.bolna.ai");
    const parsed = new URL(baseUrl);
    if (parsed.username || parsed.password)
      throw new Error("Bolna base URL cannot contain credentials");
    this.options = {
      apiKey: z.string().min(1).parse(options.apiKey),
      baseUrl: baseUrl.replace(/\/$/, ""),
      timeoutMs: options.timeoutMs ?? 10_000,
      maxRetries: options.maxRetries ?? 2,
      fetch: options.fetch ?? fetch,
      sleep:
        options.sleep ??
        ((ms) => new Promise((resolve) => setTimeout(resolve, ms))),
      random: options.random ?? Math.random,
    };
  }
  private async request<T>(path: string, schema: z.ZodType<T>): Promise<T> {
    const {
      apiKey,
      baseUrl,
      fetch: request,
      timeoutMs,
      maxRetries,
      sleep,
      random,
    } = this.options;
    for (let attempt = 0; ; attempt++) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      let response: Response;
      let body: unknown;
      try {
        response = await request(`${baseUrl}${path}`, {
          method: "GET",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            Accept: "application/json",
          },
          signal: controller.signal,
          cache: "no-store",
          redirect: "error",
        });
        const raw = await response.text();
        try {
          body = JSON.parse(raw);
        } catch {
          body = raw;
        }
      } catch {
        throw new BolnaError(0, {
          error: controller.signal.aborted
            ? "Request timed out"
            : "Network request failed",
        });
      } finally {
        clearTimeout(timeout);
      }
      log.debug("Bolna response", { status: response.status, attempt });
      if (response.ok) {
        const result = schema.safeParse(body);
        if (!result.success)
          throw new BolnaError(response.status, {
            error: "Invalid response schema",
            fields: result.error.issues.map((i) => i.path.join(".")),
          });
        return result.data;
      }
      if (
        (response.status === 429 || response.status >= 500) &&
        attempt < maxRetries
      ) {
        const retryBody = retrySchema.safeParse(body);
        const header = response.headers.get("retry-after");
        const headerMs = header
          ? /^\d+(\.\d+)?$/.test(header)
            ? Number(header) * 1000
            : Math.max(0, Date.parse(header) - Date.now())
          : 0;
        const delay =
          Math.max(
            500 * 2 ** attempt,
            retryBody.success
              ? (retryBody.data.retry_after_seconds ?? 0) * 1000
              : 0,
            Number.isFinite(headerMs) ? headerMs : 0,
          ) + Math.floor(random() * 250);
        await sleep(delay);
        continue;
      }
      throw new BolnaError(response.status, body, [apiKey]);
    }
  }
  getMe(): Promise<BolnaUser> {
    return this.request("/user/me", meSchema);
  }
  listAgents(): Promise<BolnaAgent[]> {
    return this.request("/v2/agent/all", z.array(agentSchema));
  }
  getAgent(id: string): Promise<BolnaAgent> {
    z.string()
      .min(1)
      .max(128)
      .regex(/^[a-zA-Z0-9_-]+$/)
      .parse(id);
    return this.request(`/v2/agent/${encodeURIComponent(id)}`, agentSchema);
  }
}
export function getBolnaClient(): BolnaProvider {
  const env = getEnv();
  if (!env.BOLNA_API_KEY) throw new Error("Missing BOLNA_API_KEY");
  return new BolnaClient({
    apiKey: env.BOLNA_API_KEY,
    baseUrl: env.BOLNA_API_BASE,
  });
}
