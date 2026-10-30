import { z } from "zod";
import { type Env } from "@/lib/env";
import { assertDialAllowed } from "@/lib/compliance/guards";
import { renderPrompt } from "@/lib/prompts/sections";
import { buildApiTools } from "./tools";

export const WELCOME_MESSAGE =
  "नमस्ते! मैं {{business_name}} से Chase बोल रही हूँ, एक AI assistant। क्या मेरी बात {{debtor_name}} जी से हो रही है?";
export const WELCOME_MESSAGE_EN =
  "Hello! I’m Chase, an AI assistant calling from {{business_name}}. Am I speaking with {{debtor_name}}?";
export const BRIEF_WELCOME_MESSAGE =
  "नमस्ते {{owner_name}} जी, आज का Chase brief तैयार है। सुनाऊँ?";
export function requirePublicBaseUrl(value: string) {
  const url = new URL(z.url().parse(value));
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== "/" ||
    /^(localhost|127\.|0\.|\[?::1\]?$)/i.test(url.hostname) ||
    url.hostname.endsWith(".localhost")
  )
    throw new Error(
      "APP_BASE_URL must be a public HTTPS origin. Run pnpm tunnel for instructions.",
    );
  return url.origin;
}
function build(env: Env, prompt: string, brief: boolean) {
  const baseUrl = requirePublicBaseUrl(env.APP_BASE_URL);
  const proxy = !brief && env.CHASE_LLM_MODE === "proxy";
  if (proxy && !env.CHASE_PROXY_KEY)
    throw new Error("CHASE_PROXY_KEY is required in proxy mode");
  // Bolna's LiteLLM router needs an explicit provider for newer Claude IDs.
  const modernClaude =
    env.BOLNA_LLM_PROVIDER === "anthropic" &&
    /^claude-(?:sonnet|opus|haiku|fable)-5/.test(
      env.BOLNA_LLM_MODEL.replace(/^anthropic\//, ""),
    );
  const model =
    modernClaude && !env.BOLNA_LLM_MODEL.includes("/")
      ? `anthropic/${env.BOLNA_LLM_MODEL}`
      : env.BOLNA_LLM_MODEL;
  if (!env.CHASE_WEBHOOK_SECRET || !env.CHASE_TOOL_SECRET)
    throw new Error("Missing endpoint secrets");
  if (!env.BOLNA_TTS_VOICE || !env.BOLNA_TTS_VOICE_ID)
    throw new Error("Resolve the voice catalog before syncing");
  let transferTo: string | undefined;
  if (!brief && env.ENABLE_TRANSFER && env.OWNER_PHONE) {
    assertDialAllowed(env.OWNER_PHONE, { ...env, DEMO_MODE: true });
    transferTo = env.OWNER_PHONE;
  }
  return {
    agent_config: {
      agent_name: brief ? "Chase Brief" : "Chase Collections",
      agent_welcome_message: brief ? BRIEF_WELCOME_MESSAGE : WELCOME_MESSAGE,
      webhook_url: `${baseUrl}/api/bolna/webhook?token=${encodeURIComponent(env.CHASE_WEBHOOK_SECRET)}`,
      ...(!brief
        ? { calling_guardrails: { call_start_hour: 8, call_end_hour: 19 } }
        : {}),
      tasks: [
        {
          task_type: "conversation",
          toolchain: {
            execution: "sequential",
            pipelines: [["transcriber", "llm", "synthesizer"]],
          },
          tools_config: {
            llm_agent: {
              agent_type:
                !brief && env.BOLNA_AGENT_MODE === "graph"
                  ? "graph_agent"
                  : "simple_llm_agent",
              agent_flow_type: "streaming",
              llm_config: {
                ...(proxy
                  ? {
                      provider: "custom",
                      model: "chase-claude",
                      base_url: `${baseUrl}/api/llm/v1`,
                      family: "openai",
                    }
                  : { provider: env.BOLNA_LLM_PROVIDER, model }),
                max_tokens: brief ? 200 : 150,
                ...(modernClaude && !proxy ? {} : { temperature: 0.3 }),
                ...(!brief && !proxy && env.BOLNA_AGENT_MODE === "graph"
                  ? graphConfig(model, renderPrompt(prompt))
                  : {}),
              },
            },
            transcriber: {
              provider: env.BOLNA_STT_PROVIDER,
              model: env.BOLNA_STT_MODEL,
              language: "hi",
              stream: true,
              endpointing: 400,
              keywords: `UPI, WhatsApp, payment, link, invoice, PhonePe, GPay, Paytm, ${env.BUSINESS_NAME ?? "Shree Ganesh Traders"}`,
              context:
                "Outbound payment reminder call from a Pune FMCG distributor to a shop owner. Callers mix Hindi and English and mention rupee amounts, dates and UPI apps.",
            },
            synthesizer: {
              provider: env.BOLNA_TTS_PROVIDER,
              provider_config: {
                voice: env.BOLNA_TTS_VOICE,
                voice_id: env.BOLNA_TTS_VOICE_ID,
                model: env.BOLNA_TTS_MODEL,
                language: "hi",
                speed: 1.0,
              },
              stream: true,
              buffer_size: 150,
            },
            input: { provider: env.BOLNA_TELEPHONY, format: "wav" },
            output: { provider: env.BOLNA_TELEPHONY, format: "wav" },
            ...(!brief
              ? {
                  api_tools: buildApiTools({
                    baseUrl,
                    toolSecret: env.CHASE_TOOL_SECRET,
                    transferTo,
                  }),
                }
              : {}),
          },
          task_config: {
            hangup_after_silence: 12,
            call_terminate: brief ? 420 : 300,
            incremental_delay: 450,
            number_of_words_for_interruption: 2,
            backchanneling: false,
            hangup_after_LLMCall: true,
            call_hangup_message: "धन्यवाद, आपका दिन शुभ हो।",
            voicemail: true,
            check_if_user_online: true,
            trigger_user_online_message_after: 8,
          },
        },
      ],
    },
    agent_prompts: { task_1: { system_prompt: renderPrompt(prompt) } },
  };
}
function graphConfig(model: string, prompt: string) {
  return {
    agent_information: prompt,
    routing_model: model,
    current_node_id: "main",
    nodes: [
      {
        id: "main",
        prompt: "Run the collections conversation as described.",
        edges: [
          {
            to_node_id: "guide_payment",
            condition_type: "event",
            event_name: "link_opened",
          },
          {
            to_node_id: "payment_confirmed",
            condition_type: "event",
            event_name: "payment_completed",
          },
          {
            to_node_id: "closing",
            condition: "The conversation is complete and agreed",
          },
        ],
      },
      {
        id: "guide_payment",
        prompt:
          "The caller opened the payment link for {{link_amount}}. Briefly guide them to tap Pay, choose UPI and approve, then wait.",
        edges: [
          {
            to_node_id: "payment_confirmed",
            condition_type: "event",
            event_name: "payment_completed",
          },
          {
            to_node_id: "main",
            condition: "The caller discusses something else",
          },
        ],
      },
      {
        id: "payment_confirmed",
        prompt:
          "Payment of {{paid_amount_spoken}} arrived, reference {{payment_ref}}. Thank them, confirm {{remaining_spoken}}, then ask for a date if needed.",
        edges: [
          { to_node_id: "main", condition: "A balance remains" },
          { to_node_id: "closing", condition: "Nothing remains to discuss" },
        ],
      },
      {
        id: "closing",
        prompt:
          "Summarise the agreement in one sentence, thank them and end the call.",
        edges: [],
      },
    ],
  };
}
export const buildCollectionsAgent = (env: Env, prompt: string) =>
  build(env, prompt, false);
export const buildBriefAgent = (env: Env, prompt: string) =>
  build(env, prompt, true);
export type AgentPayload = ReturnType<typeof buildCollectionsAgent>;
