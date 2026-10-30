import { describe, expect, it } from "vitest";
import {
  buildCollectionsAgent,
  buildBriefAgent,
} from "@/lib/bolna/agent-config";
import { buildApiTools, TOOL_NAMES, toolUrl } from "@/lib/bolna/tools";
import { pickVoice, voiceOptions, modelsFor } from "@/lib/bolna/voices";
import { loadEnv } from "@/lib/env";
import { readPromptFile } from "@/lib/prompts";
import type { BolnaVoice } from "@/lib/bolna/client";

const toolSecret = "unit-test-tool-secret-value";
const baseUrl = "https://chase.example.com";

const voices: BolnaVoice[] = [
  {
    id: "1",
    voice_id: "simran",
    name: "Simran",
    provider: "sarvam",
    model: "bulbul:v3",
    language_code: "hi-IN",
    accent: "Indian Female",
  },
  {
    id: "2",
    voice_id: "simran",
    name: "Simran",
    provider: "sarvam",
    model: "bulbul:v3",
    language_code: "en-IN",
    accent: "Indian Female",
  },
  {
    id: "3",
    voice_id: "meera",
    name: "Meera",
    provider: "sarvam",
    model: "bulbul:v2",
    language_code: "hi-IN",
    accent: "Indian Female",
  },
  {
    id: "4",
    voice_id: "callie",
    name: "Callie",
    provider: "cartesia",
    model: "sonic-3",
    language_code: "en-US",
    accent: null,
  },
];

describe("voice resolution", () => {
  it("resolves a catalogued voice and prefers the call language row", () => {
    const resolved = pickVoice(voices, {
      provider: "sarvam",
      model: "bulbul:v3",
      voiceId: "SIMRAN",
      language: "hi",
    });
    expect(resolved).toMatchObject({
      provider: "sarvam",
      model: "bulbul:v3",
      voice: "Simran",
      voiceId: "simran",
      languageCode: "hi-IN",
    });
  });

  it("refuses an uncatalogued provider, model or voice", () => {
    expect(() =>
      pickVoice(voices, { provider: "nope", model: "x", voiceId: "y" }),
    ).toThrow(/Available providers/);
    expect(() =>
      pickVoice(voices, {
        provider: "sarvam",
        model: "bulbul:v4-flash",
        voiceId: "simran",
      }),
    ).toThrow(/Available models: bulbul:v2, bulbul:v3/);
    expect(() =>
      pickVoice(voices, {
        provider: "sarvam",
        model: "bulbul:v3",
        voiceId: "ghost",
      }),
    ).toThrow(/not in this account's catalog/);
  });

  it("lists distinct options per model for an operator to choose", () => {
    expect(modelsFor(voices, "sarvam")).toEqual(["bulbul:v2", "bulbul:v3"]);
    expect(
      voiceOptions(voices, { provider: "sarvam", language: "hi" }).map(
        (v) => `${v.model}:${v.voice_id}`,
      ),
    ).toEqual(["bulbul:v3:simran", "bulbul:v2:meera"]);
  });
});

describe("mid-call tools", () => {
  const { tools, tools_params } = buildApiTools({ baseUrl, toolSecret });

  it("wires every tool to its own endpoint with its own bearer secret", () => {
    expect(tools.map((t) => t.name)).toEqual([...TOOL_NAMES]);
    for (const tool of tools) {
      expect(tool.key).toBe("custom_task");
      const value = tools_params[String(tool.name)] as Record<string, unknown>;
      expect(value.method).toBe("POST");
      expect(value.url).toBe(toolUrl(baseUrl, String(tool.name)));
      expect(value.api_token).toBe(`Bearer ${toolSecret}`);
      expect(value.headers).toEqual({});
      // The call is identified by our own token, never by the customer.
      expect((value.param as Record<string, string>).call_token).toBe(
        "%(call_token)s",
      );
      expect(tool.pre_call_message).toBeTruthy();
    }
  });

  it("maps every declared parameter with a matching format specifier", () => {
    for (const tool of tools) {
      const properties = Object.keys(
        (tool.parameters as { properties: Record<string, unknown> }).properties,
      );
      const param = (
        tools_params[String(tool.name)] as { param: Record<string, string> }
      ).param;
      expect(Object.keys(param).sort()).toEqual(properties.sort());
      for (const mapped of Object.values(param))
        if (mapped.startsWith("%(")) expect(mapped).toMatch(/^%\(.+\)[sif]$/);
    }
  });

  it("sends money as an integer rupee parameter", () => {
    const link = tools.find((t) => t.name === "send_payment_link")!;
    expect(
      (tools_params.send_payment_link as { param: Record<string, string> })
        .param.amount_rupees,
    ).toBe("%(amount_rupees)i");
    expect((link.parameters as { required: string[] }).required).toEqual([
      "account_id",
      "call_token",
      "amount_rupees",
    ]);
  });

  it("adds the owner transfer tool only when a destination is given", () => {
    expect(tools.some((t) => t.key === "transfer_call")).toBe(false);
    const withTransfer = buildApiTools({
      baseUrl,
      toolSecret,
      transferTo: "+919812345678",
    });
    const transfer = withTransfer.tools.find((t) => t.key === "transfer_call")!;
    expect(transfer.name).toBe("transfer_to_owner");
    expect(
      (
        withTransfer.tools_params.transfer_to_owner as {
          param: Record<string, string>;
        }
      ).param.call_transfer_number,
    ).toBe("+919812345678");
    expect(() =>
      buildApiTools({ baseUrl, toolSecret, transferTo: "9812345678" }),
    ).toThrow();
  });

  it("rejects a non-HTTPS style misconfiguration of the tool base URL", () => {
    expect(() => buildApiTools({ baseUrl: "not-a-url", toolSecret })).toThrow();
    expect(() => buildApiTools({ baseUrl, toolSecret: "short" })).toThrow();
  });
});

describe("agent contracts", () => {
  const env = loadEnv({
    APP_BASE_URL: baseUrl,
    CHASE_TOOL_SECRET: toolSecret,
    CHASE_WEBHOOK_SECRET: "test-webhook-secret",
    BOLNA_TTS_VOICE: "Simran",
    BOLNA_TTS_VOICE_ID: "simran_enhi_customer",
  });
  it("uses the required hard backstop, sequential pipeline, exact welcome and tool names", () => {
    const p = buildCollectionsAgent(env, readPromptFile("collections").source);
    expect(p.agent_config.calling_guardrails).toEqual({
      call_start_hour: 8,
      call_end_hour: 19,
    });
    expect(p.agent_config.agent_welcome_message).toContain("{{debtor_name}}");
    expect(p.agent_config.agent_welcome_message).toContain("AI assistant");
    expect(p.agent_config.tasks[0].toolchain.execution).toBe("sequential");
    expect(p.agent_config.tasks[0].tools_config.transcriber.language).toBe(
      "hi",
    );
    expect(p.agent_prompts.task_1.system_prompt).not.toContain("<!--");
    expect(
      p.agent_config.tasks[0].tools_config.llm_agent.llm_config.model,
    ).toBe("anthropic/claude-sonnet-5");
    expect(
      p.agent_config.tasks[0].tools_config.llm_agent.llm_config,
    ).not.toHaveProperty("temperature");
  });
  it("keeps owner brief free of collection tools and collection guardrails", () => {
    const p = buildBriefAgent(env, readPromptFile("brief").source);
    expect(p.agent_config).not.toHaveProperty("calling_guardrails");
    expect(p.agent_config.tasks[0].tools_config).not.toHaveProperty(
      "api_tools",
    );
    expect(p.agent_config.tasks[0].task_config.call_terminate).toBe(420);
  });
  it("builds event-driven payment nodes in graph mode", () => {
    const p = buildCollectionsAgent(
      { ...env, BOLNA_AGENT_MODE: "graph" },
      readPromptFile("collections").source,
    );
    const llm = p.agent_config.tasks[0].tools_config.llm_agent;
    expect(llm.agent_type).toBe("graph_agent");
    expect(
      llm.llm_config.nodes!.map((node: { id: string }) => node.id),
    ).toEqual(["main", "guide_payment", "payment_confirmed", "closing"]);
  });
  it("rejects localhost HTTPS and unallowlisted transfers", () => {
    expect(() =>
      buildCollectionsAgent(
        { ...env, APP_BASE_URL: "https://localhost" },
        readPromptFile("collections").source,
      ),
    ).toThrow();
    expect(() =>
      buildCollectionsAgent(
        {
          ...env,
          ENABLE_TRANSFER: true,
          OWNER_PHONE: "+919812345678",
          CALL_ALLOWLIST: [],
        },
        readPromptFile("collections").source,
      ),
    ).toThrow();
  });
});
