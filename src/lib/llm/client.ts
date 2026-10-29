import { getEnv, type Env } from "@/lib/env";
import { getLLM } from "./index";
// Retain the Part 1 smoke interface; calls now receive routing and audit telemetry.
export function createLlmClient(env: Env = getEnv()) {
  return {
    async ping() {
      await getLLM(env).generateText({
        task: "ping",
        system: [],
        messages: [{ role: "user", content: "Say OK." }],
        maxTokens: 5,
      });
    },
  };
}
