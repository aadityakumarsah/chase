import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { z } from "zod";
import { type AgentPayload } from "./agent-config";
const taskSchema = z.object({
  tools_config: z.object({
    llm_agent: z.object({
      llm_config: z.object({ provider: z.string(), model: z.string() }),
    }),
    synthesizer: z.object({
      provider: z.string(),
      provider_config: z.object({
        voice: z.string(),
        voice_id: z.string(),
        model: z.string(),
      }),
    }),
    api_tools: z
      .object({
        tools: z.array(z.object({ name: z.string() })).nullish(),
        tools_params: z.record(z.string(), z.unknown()).nullish(),
      })
      .nullish(),
  }),
});
export function importantAgentFields(value: unknown) {
  const data = z
    .object({
      agent_name: z.string(),
      webhook_url: z.string(),
      tasks: z.array(taskSchema).min(1),
      agent_prompts: z.object({
        task_1: z.object({ system_prompt: z.string() }),
      }),
      calling_guardrails: z
        .object({ call_start_hour: z.number(), call_end_hour: z.number() })
        .nullish(),
    })
    .parse(value);
  const config = data.tasks[0].tools_config;
  const names = (config.api_tools?.tools ?? []).map((t) => t.name).sort();
  return {
    name: data.agent_name,
    promptHash: createHash("sha256")
      .update(data.agent_prompts.task_1.system_prompt)
      .digest("hex"),
    webhook: data.webhook_url,
    guardrails: data.calling_guardrails ?? null,
    llm: config.llm_agent.llm_config,
    voice: config.synthesizer,
    tools: names.map((name) => ({
      name,
      config: z
        .object({
          url: z.string().nullable(),
          method: z.string(),
          headers: z.record(z.string(), z.string()),
          param: z.record(z.string(), z.string()),
          api_token: z.string().optional(),
        })
        .parse(config.api_tools?.tools_params?.[name]),
    })),
  };
}
export function assertAgentRoundTrip(payload: AgentPayload, received: unknown) {
  const wanted = importantAgentFields({
    ...payload.agent_config,
    agent_prompts: payload.agent_prompts,
  });
  const actual = importantAgentFields(received);
  const changed = (Object.keys(wanted) as (keyof typeof wanted)[]).filter(
    (k) => !isDeepStrictEqual(wanted[k], actual[k]),
  );
  if (changed.length)
    throw new Error(`Bolna round trip changed fields: ${changed.join(", ")}`);
  return wanted.promptHash;
}
