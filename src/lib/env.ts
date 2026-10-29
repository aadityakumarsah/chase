import { z } from "zod";

const optional = z.string().min(1).optional();
const secret = z.string().min(16).optional();
const bool = z.enum(["true", "false"]).transform((v) => v === "true");
const phone = z.string().regex(/^\+[1-9]\d{6,14}$/);
const httpUrl = z.url({ protocol: /^https?$/ }).refine((v) => {
  const u = new URL(v);
  return !u.username && !u.password;
});
const provider = z.enum([
  "anthropic",
  "openai",
  "openrouter",
  "gemini",
  "groq",
  "deepseek",
  "together",
  "openai_compatible",
]);

export const envSchema = z.object({
  // Core
  APP_BASE_URL: httpUrl.default("http://localhost:3000"),
  DATABASE_URL: z
    .string()
    .url()
    .refine((v) => /^postgres(ql)?:/.test(v))
    .optional(),
  DEMO_MODE: bool.default(true),
  DEFAULT_TZ: z.literal("Asia/Kolkata").default("Asia/Kolkata"),
  ADMIN_PASSCODE: secret,
  CHASE_TOOL_SECRET: secret,
  CHASE_WEBHOOK_SECRET: secret,
  CHASE_PROXY_KEY: secret,
  CRON_SECRET: secret,
  CALL_ALLOWLIST: z
    .string()
    .default("")
    .transform((v) =>
      v
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    )
    .pipe(z.array(phone)),
  DEMO_DEBTOR_PHONE: phone.optional(),
  // Business
  BUSINESS_NAME: optional,
  OWNER_NAME: optional,
  OWNER_PHONE: phone.optional(),
  MERCHANT_UPI_VPA: z
    .string()
    .regex(/^[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+$/)
    .optional(),
  MERCHANT_NAME: optional,
  // Bolna
  BOLNA_API_KEY: optional,
  BOLNA_API_BASE: httpUrl.default("https://api.bolna.ai"),
  BOLNA_FROM_NUMBER: phone.optional(),
  BOLNA_COLLECTIONS_AGENT_ID: optional,
  BOLNA_BRIEF_AGENT_ID: optional,
  BOLNA_AGENT_MODE: z.enum(["simple", "graph"]).default("simple"),
  BOLNA_TELEPHONY: z.string().default("plivo"),
  BOLNA_LLM_PROVIDER: z.string().default("anthropic"),
  BOLNA_LLM_MODEL: z.string().default("claude-sonnet-5"),
  BOLNA_STT_PROVIDER: z.string().default("sarvam"),
  BOLNA_STT_MODEL: z.string().default("saaras:v4"),
  BOLNA_TTS_PROVIDER: z.string().default("sarvam"),
  BOLNA_TTS_MODEL: z.string().default("bulbul:v4-flash"),
  BOLNA_TTS_VOICE: optional,
  BOLNA_TTS_VOICE_ID: optional,
  CHASE_LLM_MODE: z.enum(["native", "proxy"]).default("native"),
  ENABLE_TRANSFER: bool.default(false),
  // LLM
  LLM_PROVIDER: provider.default("anthropic"),
  LLM_BASE_URL: httpUrl.optional(),
  LLM_API_KEY: optional,
  ANTHROPIC_API_KEY: optional,
  LLM_MODEL_FAST: z.string().default("claude-haiku-5-5"),
  LLM_MODEL_SMART: z.string().default("claude-sonnet-5-5"),
  LLM_MODEL_DEEP: z.string().default("claude-opus-5-5"),
  LLM_FALLBACK_PROVIDER: provider.optional(),
  LLM_FALLBACK_MODEL: optional,
  // Messaging
  MESSAGING_PROVIDER: z
    .enum(["console", "meta_whatsapp", "twilio_whatsapp", "twilio_sms"])
    .default("console"),
  META_WA_TOKEN: optional,
  META_WA_PHONE_NUMBER_ID: optional,
  META_WA_VERIFY_TOKEN: optional,
  META_WA_TEMPLATE_NAME: optional,
  TWILIO_ACCOUNT_SID: optional,
  TWILIO_AUTH_TOKEN: optional,
  TWILIO_WHATSAPP_FROM: z
    .string()
    .regex(/^whatsapp:\+[1-9]\d{6,14}$/)
    .optional(),
  TWILIO_SMS_FROM: phone.optional(),
  // Payments
  PAYMENTS_PROVIDER: z.enum(["hosted", "razorpay"]).default("hosted"),
  RAZORPAY_KEY_ID: optional,
  RAZORPAY_KEY_SECRET: optional,
  RAZORPAY_WEBHOOK_SECRET: optional,
});
export type Env = z.infer<typeof envSchema>;

export const aliases: Partial<Record<keyof Env, readonly string[]>> = {
  BOLNA_API_KEY: [
    "BOLNA_KEY",
    "BOLNA_API",
    "BOLNA_TOKEN",
    "BOLNA_API_NAME",
    "BOLNA_API_NAME_KEY",
    "BOLNA_API_KEY_NAME",
  ],
  META_WA_TOKEN: ["META_WA_ACCESS_TOKEN"],
  TWILIO_SMS_FROM: ["TWILIO_PHONE_NUMBER"],
};

// Never include Zod issue messages or input values: enum errors can echo credentials.
export function loadEnv(
  source: Record<string, string | undefined> = process.env,
): Env {
  const input: Record<string, string | undefined> = {};
  for (const key of Object.keys(envSchema.shape) as (keyof Env)[]) {
    input[key] = [key, ...(aliases[key] ?? [])]
      .map((k) => source[k]?.trim())
      .find(Boolean);
  }
  const result = envSchema.safeParse(input);
  if (!result.success) {
    throw new Error(
      `Invalid environment keys: ${[...new Set(result.error.issues.map((i) => i.path.join(".")))].join(", ")}`,
    );
  }
  return result.data;
}

// Lazy loading keeps build and test imports independent of deployment credentials.
export function getEnv(): Env {
  return loadEnv();
}
export type IntegrationStatus = {
  status: "configured" | "missing";
  missing: string[];
};
export function configReport(
  config: Env = getEnv(),
): Record<string, IntegrationStatus> {
  const check = (keys: (keyof Env)[]): IntegrationStatus => {
    const missing = keys.filter((k) => {
      const v = config[k];
      return v === undefined || v === "" || (Array.isArray(v) && !v.length);
    });
    return { status: missing.length ? "missing" : "configured", missing };
  };
  const llmKeys: (keyof Env)[] =
    config.LLM_PROVIDER === "anthropic"
      ? config.LLM_API_KEY
        ? ["LLM_API_KEY"]
        : ["ANTHROPIC_API_KEY"]
      : [
          "LLM_API_KEY",
          ...(config.LLM_PROVIDER === "openai_compatible"
            ? ["LLM_BASE_URL" as const]
            : []),
        ];
  const messagingKeys: Record<Env["MESSAGING_PROVIDER"], (keyof Env)[]> = {
    console: [],
    meta_whatsapp: [
      "META_WA_TOKEN",
      "META_WA_PHONE_NUMBER_ID",
      "META_WA_VERIFY_TOKEN",
      "META_WA_TEMPLATE_NAME",
    ],
    twilio_whatsapp: [
      "TWILIO_ACCOUNT_SID",
      "TWILIO_AUTH_TOKEN",
      "TWILIO_WHATSAPP_FROM",
    ],
    twilio_sms: ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_SMS_FROM"],
  };
  return {
    database: check(["DATABASE_URL"]),
    security: check([
      "ADMIN_PASSCODE",
      "CHASE_TOOL_SECRET",
      "CHASE_WEBHOOK_SECRET",
      "CHASE_PROXY_KEY",
      "CRON_SECRET",
    ]),
    bolna: check(["BOLNA_API_KEY"]),
    llm: check(llmKeys),
    messaging: check(messagingKeys[config.MESSAGING_PROVIDER]),
    payments: check(
      config.PAYMENTS_PROVIDER === "razorpay"
        ? ["RAZORPAY_KEY_ID", "RAZORPAY_KEY_SECRET", "RAZORPAY_WEBHOOK_SECRET"]
        : ["MERCHANT_UPI_VPA", "MERCHANT_NAME"],
    ),
    demoCalling: check(
      config.DEMO_MODE ? ["CALL_ALLOWLIST", "DEMO_DEBTOR_PHONE"] : [],
    ),
    collectionsAgent: check(["BOLNA_COLLECTIONS_AGENT_ID"]),
    briefAgent: check(["BOLNA_BRIEF_AGENT_ID", "OWNER_PHONE"]),
    voice: check(["BOLNA_TTS_VOICE", "BOLNA_TTS_VOICE_ID"]),
  };
}
