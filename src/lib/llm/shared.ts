import { setTimeout as delay } from "node:timers/promises";
import { z } from "zod";
import { LLMError, type TextRequest, type Usage } from "./types";
import { TASK_TIMEOUTS } from "./routing";
export function requestSignal(input: TextRequest): AbortSignal {
  z.enum(
    Object.keys(TASK_TIMEOUTS) as [
      keyof typeof TASK_TIMEOUTS,
      ...Array<keyof typeof TASK_TIMEOUTS>,
    ],
  ).parse(input.task);
  z.number().int().positive().max(32768).parse(input.maxTokens);
  z.array(z.object({ text: z.string(), cache: z.boolean().optional() })).parse(
    input.system,
  );
  z.array(
    z.object({ role: z.enum(["user", "assistant"]), content: z.string() }),
  )
    .min(1)
    .parse(input.messages);
  if (input.temperature !== undefined)
    z.number().min(0).max(0.3).parse(input.temperature);
  const timeout = AbortSignal.timeout(TASK_TIMEOUTS[input.task]);
  return input.signal ? AbortSignal.any([input.signal, timeout]) : timeout;
}
export function safeError(error: unknown, signal?: AbortSignal): LLMError {
  if (error instanceof LLMError) return error;
  if (error instanceof z.ZodError || error instanceof SyntaxError)
    return new LLMError("validation");
  if (signal?.aborted)
    return new LLMError(
      signal.reason?.name === "TimeoutError" ? "provider" : "aborted",
    );
  const status =
    typeof error === "object" &&
    error !== null &&
    "status" in error &&
    typeof error.status === "number"
      ? error.status
      : undefined;
  if (
    status === 400 &&
    error instanceof Error &&
    /(?:response_format|json_schema)/i.test(error.message) &&
    /(?:not supported|unsupported|does not support)/i.test(error.message)
  )
    return new LLMError("unsupported_format", status);
  return new LLMError("provider", status);
}
export async function retry<T>(
  fn: () => Promise<T>,
  signal: AbortSignal,
): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    signal.throwIfAborted();
    try {
      return await fn();
    } catch (e) {
      const error = safeError(e, signal);
      if (
        signal.aborted ||
        attempt === 2 ||
        ![429, 500, 529].includes(error.status ?? 0)
      )
        throw error;
      await delay(150 * 2 ** attempt + Math.random() * 100, undefined, {
        signal,
      });
    }
  }
}
export type JsonSchema = Record<string, unknown>;
export function jsonSchema(schema: z.ZodType): JsonSchema {
  try {
    return z.toJSONSchema(schema, { unrepresentable: "throw" }) as JsonSchema;
  } catch {
    throw new LLMError("configuration");
  }
}
// Normalize only declared enum/const values, never free-form evidence or names.
export function normalizeEnums(
  value: unknown,
  schema: JsonSchema,
  root: JsonSchema = schema,
): unknown {
  if (typeof schema.$ref === "string" && schema.$ref.startsWith("#/")) {
    let target: unknown = root;
    for (const key of schema.$ref.slice(2).split("/"))
      target = (target as JsonSchema)[key];
    return normalizeEnums(value, target as JsonSchema, root);
  }
  const choices = Array.isArray(schema.enum)
    ? schema.enum
    : typeof schema.const === "string"
      ? [schema.const]
      : [];
  if (typeof value === "string")
    return (
      choices.find(
        (v) => typeof v === "string" && v.toLowerCase() === value.toLowerCase(),
      ) ?? value
    );
  if (Array.isArray(value) && schema.items)
    return value.map((v) =>
      normalizeEnums(v, schema.items as JsonSchema, root),
    );
  if (value && typeof value === "object" && schema.properties) {
    const props = schema.properties as Record<string, JsonSchema>;
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [
        k,
        props[k] ? normalizeEnums(v, props[k], root) : v,
      ]),
    );
  }
  return value;
}
export function parseObject<T>(text: string, schema: z.ZodType<T>): T {
  try {
    return schema.parse(normalizeEnums(JSON.parse(text), jsonSchema(schema)));
  } catch {
    throw new LLMError("validation");
  }
}
export function assertSchemaLimits(schemas: JsonSchema[], toolCount = 0) {
  let optional = 0;
  const walk = (s: unknown) => {
    if (!s || typeof s !== "object") return;
    const o = s as JsonSchema;
    if (o.properties) {
      const required = Array.isArray(o.required) ? o.required : [];
      optional += Object.keys(o.properties).filter(
        (k) => !required.includes(k),
      ).length;
    }
    for (const v of Object.values(o))
      if (typeof v === "object") {
        if (Array.isArray(v)) v.forEach(walk);
        else walk(v);
      }
  };
  schemas.forEach(walk);
  if (toolCount > 20 || optional > 24) throw new LLMError("configuration");
}
export function addUsage(a: Usage, b: Usage): Usage {
  return {
    input: a.input + b.input,
    output: a.output + b.output,
    cacheRead: a.cacheRead + b.cacheRead,
    cacheWrite: a.cacheWrite + b.cacheWrite,
  };
}
