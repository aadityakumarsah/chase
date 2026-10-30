import { z } from "zod";
import { getEnv } from "@/lib/env";
import { log, redact } from "@/lib/log";
import {
  agentPayloadSchema,
  providersSchema,
  catalogVoiceSchema,
  voicesQuerySchema,
  sessionInputSchema,
  sessionSchema,
  customModelSchema,
  jsonObject,
  type VoicesQuery,
} from "./contracts";
import { type AgentPayload } from "./agent-config";
import { e164Schema } from "@/lib/phone";

const meSchema = z.object({
  name: z.string(),
  wallet: z
    .union([z.number(), z.string(), z.record(z.string(), z.unknown())])
    .nullable(),
  concurrency: z
    .union([z.number(), z.record(z.string(), z.unknown())])
    .nullable(),
});
const agentSchema = z.looseObject({
  id: z.string().min(1),
  agent_name: z.string(),
  agent_status: z.string().optional(),
  webhook_url: z.string().nullish(),
  agent_welcome_message: z.string().optional(),
  calling_guardrails: z.union([jsonObject, z.string()]).nullish(),
  tasks: z.array(z.record(z.string(), z.json())).optional(),
  agent_prompts: z.record(z.string(), z.json()).optional(),
});
const createAgentSchema = z.object({
  agent_id: z.string().min(1),
  // Documented as `state` on 201; older examples show `status`. Accept either.
  state: z.string(),
  status: z.string().optional(),
});
const startCallSchema = z.object({
  execution_id: z.string().min(1),
  status: z.string().optional(),
  message: z.string().optional(),
});
const voiceSchema = z.object({
  id: z.string().min(1),
  voice_id: z.string().min(1),
  name: z.string().min(1),
  provider: z.string().min(1),
  model: z.string().nullable().optional(),
  language_code: z.string().nullable().optional(),
  accent: z.string().nullable().optional(),
});
const voiceListSchema = z.object({ data: z.array(voiceSchema) });
/** Executions are read defensively: Bolna adds fields and we only need a few. */
export const executionSchema = z.looseObject({
  id: z.union([z.string(), z.number()]).transform(String),
  agent_id: z.string().nullish(),
  batch_id: z.string().nullish(),
  status: z.string(),
  termination_reason: z.string().nullish(),
  latency_data: z
    .looseObject({ time_to_first_audio: z.number().nullish() })
    .nullish(),
  error_message: z.string().nullish(),
  conversation_duration: z.coerce.number().nonnegative().nullish(),
  total_cost: z.coerce.number().nonnegative().nullish(),
  answered_by_voice_mail: z.boolean().nullish(),
  transcript: z.string().nullish(),
  created_at: z.string().nullish(),
  updated_at: z.string().nullish(),
  usage_breakdown: z.looseObject({}).nullish(),
  telephony_data: z
    .looseObject({
      duration: z.coerce.number().nonnegative().nullish(),
      to_number: z.string().nullish(),
      from_number: z.string().nullish(),
      recording_url: z.string().nullish(),
      provider_call_id: z.string().nullish(),
      provider: z.string().nullish(),
      call_type: z.string().nullish(),
      hangup_reason: z.string().nullish(),
      hangup_by: z.string().nullish(),
      hangup_code: z.union([z.string(), z.number()]).nullish(),
      ring_duration: z.coerce.number().nonnegative().nullish(),
      post_dial_delay: z.coerce.number().nullish(),
    })
    .nullish(),
  transfer_call_data: z.looseObject({}).nullish(),
  extracted_data: z.looseObject({}).nullish(),
  context_details: z.looseObject({}).nullish(),
});

export type BolnaUser = z.infer<typeof meSchema>;
export type BolnaAgent = z.infer<typeof agentSchema>;
export type BolnaVoice = z.infer<typeof voiceSchema>;
export type BolnaExecution = z.infer<typeof executionSchema>;

export const startCallInputSchema = z.object({
  agent_id: z.string().min(1).max(128),
  recipient_phone_number: e164Schema,
  from_phone_number: e164Schema.optional(),
  // Bolna rejects a trailing "Z"; build this with bolnaScheduledAt().
  scheduled_at: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\+00:00$/)
    .optional(),
  user_data: z.record(z.string(), z.union([z.string(), z.number()])).optional(),
  agent_data: z.record(z.string(), z.json()).optional(),
  bypass_call_guardrails: z.boolean().optional(),
});
export type StartCallInput = z.infer<typeof startCallInputSchema>;

export interface BolnaProvider {
  getMe(): Promise<BolnaUser>;
  listAgents(): Promise<BolnaAgent[]>;
  getAgent(id: string): Promise<BolnaAgent>;
  listVoices(): Promise<BolnaVoice[]>;
  listVoices(query: VoicesQuery): Promise<z.infer<typeof catalogVoiceSchema>[]>;
  listTtsProviders(language: string): Promise<z.infer<typeof providersSchema>>;
  listPhoneNumbers(): Promise<
    { phone_number: string; telephony_provider?: string }[]
  >;
  patchAgent(
    id: string,
    patch: Record<string, z.infer<ReturnType<typeof z.json>>>,
  ): Promise<unknown>;
  makeCall(input: StartCallInput): Promise<z.infer<typeof startCallSchema>>;
  mintWebCallSession(
    input: z.infer<typeof sessionInputSchema>,
  ): Promise<z.infer<typeof sessionSchema>>;
  addCustomModel(
    input: z.infer<typeof customModelSchema>,
  ): Promise<{ status: string; message: string }>;
  sendGraphEvent(
    runId: string,
    input: {
      event: string;
      properties?: Record<string, z.infer<ReturnType<typeof z.json>>>;
    },
  ): Promise<unknown>;
  createAgent(
    payload: AgentPayload,
  ): Promise<z.infer<typeof createAgentSchema>>;
  updateAgent(id: string, payload: AgentPayload): Promise<unknown>;
  startCall(input: StartCallInput): Promise<z.infer<typeof startCallSchema>>;
  stopCall(executionId: string): Promise<unknown>;
  getExecution(executionId: string): Promise<BolnaExecution>;
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
const idSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[a-zA-Z0-9_-]+$/);

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

  /**
   * Only GET is retried. A retried POST /call could place a second real phone
   * call, and Bolna has no idempotency key, so writes fail fast instead.
   */
  private async request<T>(
    path: string,
    schema: z.ZodType<T>,
    init: { method?: "GET" | "POST" | "PATCH" | "PUT"; body?: unknown } = {},
  ): Promise<T> {
    const {
      apiKey,
      baseUrl,
      fetch: request,
      timeoutMs,
      maxRetries,
      sleep,
      random,
    } = this.options;
    const method = init.method ?? "GET";
    const retries = method === "GET" ? maxRetries : 0;
    for (let attempt = 0; ; attempt++) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      let response: Response;
      let body: unknown;
      try {
        response = await request(`${baseUrl}${path}`, {
          method,
          headers: {
            Authorization: `Bearer ${apiKey}`,
            Accept: "application/json",
            ...(init.body === undefined
              ? {}
              : { "Content-Type": "application/json" }),
          },
          body: init.body === undefined ? undefined : JSON.stringify(init.body),
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
      log.debug("Bolna response", { method, status: response.status, attempt });
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
        attempt < retries
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
      throw new BolnaError(response.status, redact(body), [apiKey]);
    }
  }

  getMe(): Promise<BolnaUser> {
    return this.request("/user/me", meSchema);
  }
  listAgents(): Promise<BolnaAgent[]> {
    return this.request("/v2/agent/all", z.array(agentSchema));
  }
  async getAgent(id: string): Promise<BolnaAgent> {
    return this.request(
      `/v2/agent/${encodeURIComponent(idSchema.parse(id))}`,
      agentSchema,
    );
  }
  /** Account-visible voice catalog; the only catalog this account can select from. */
  listVoices(): Promise<BolnaVoice[]>;
  listVoices(query: VoicesQuery): Promise<z.infer<typeof catalogVoiceSchema>[]>;
  async listVoices(query?: VoicesQuery) {
    if (!query) return (await this.request("/me/voices", voiceListSchema)).data;
    const validated = voicesQuerySchema.parse(query);
    const params = new URLSearchParams(
      Object.entries(validated).map(([k, v]) => [k, String(v)]),
    );
    return (
      await this.request(
        `/api/v1/voice-config/tts/voices?${params}`,
        z.object({ items: z.array(catalogVoiceSchema) }),
      )
    ).items;
  }
  async listTtsProviders(language: string) {
    return this.request(
      `/api/v1/voice-config/tts?language=${encodeURIComponent(z.string().min(2).max(10).parse(language))}`,
      providersSchema,
    );
  }
  async listPhoneNumbers() {
    return this.request(
      "/phone-numbers/all",
      z.array(
        z.object({
          phone_number: z.string(),
          telephony_provider: z.string().optional(),
        }),
      ),
    );
  }
  async patchAgent(
    id: string,
    patch: Record<string, z.infer<ReturnType<typeof z.json>>>,
  ) {
    return this.request(`/v2/agent/${idSchema.parse(id)}`, z.unknown(), {
      method: "PATCH",
      body: jsonObject.parse(patch),
    });
  }
  makeCall(input: StartCallInput) {
    return this.startCall(input);
  }
  async mintWebCallSession(input: z.infer<typeof sessionInputSchema>) {
    return this.request("/web-call/session", sessionSchema, {
      method: "POST",
      body: sessionInputSchema.parse(input),
    });
  }
  async addCustomModel(input: z.infer<typeof customModelSchema>) {
    return this.request(
      "/user/model/custom",
      z.object({ status: z.string(), message: z.string() }),
      { method: "POST", body: customModelSchema.parse(input) },
    );
  }
  async sendGraphEvent(
    runId: string,
    input: {
      event: string;
      properties?: Record<string, z.infer<ReturnType<typeof z.json>>>;
    },
  ) {
    return this.request(
      `/v1/call/${idSchema.parse(runId)}/events`,
      z.unknown(),
      {
        method: "POST",
        body: z
          .object({
            event: z.string().min(1),
            properties: jsonObject.optional(),
          })
          .parse(input),
      },
    );
  }
  async createAgent(payload: AgentPayload) {
    return this.request("/v2/agent", createAgentSchema, {
      method: "POST",
      body: agentPayloadSchema.parse(payload),
    });
  }
  async updateAgent(id: string, payload: AgentPayload) {
    return this.request(
      `/v2/agent/${encodeURIComponent(idSchema.parse(id))}`,
      z.unknown(),
      { method: "PUT", body: agentPayloadSchema.parse(payload) },
    );
  }
  async startCall(input: StartCallInput) {
    return this.request("/call", startCallSchema, {
      method: "POST",
      body: startCallInputSchema.parse(input),
    });
  }
  async stopCall(executionId: string) {
    return this.request(
      `/call/${encodeURIComponent(idSchema.parse(executionId))}/stop`,
      z.unknown(),
      { method: "POST" },
    );
  }
  async getExecution(executionId: string): Promise<BolnaExecution> {
    return this.request(
      `/executions/${encodeURIComponent(idSchema.parse(executionId))}`,
      executionSchema,
    );
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
