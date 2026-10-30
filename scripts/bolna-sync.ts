import { loadEnvConfig } from "@next/env";
import { appendFileSync } from "node:fs";
loadEnvConfig(process.cwd(), true, { info() {}, error() {} });

/** Values are validated, never printed. Existing .env bytes are preserved. */
function appendConfig(key: string, value: string) {
  if (/[\r\n]/.test(value)) throw new Error("Invalid configuration value");
  appendFileSync(".env", `\n${key}=${JSON.stringify(value)}\n`, {
    mode: 0o600,
  });
  process.env[key] = value;
  console.log(`Appended ${key} to .env`);
}
async function main() {
  const { getEnv } = await import("../src/lib/env");
  const { closeDb } = await import("../src/lib/db");
  const { getBolnaClient, BolnaError } =
    await import("../src/lib/bolna/client");
  const { buildCollectionsAgent, buildBriefAgent, requirePublicBaseUrl } =
    await import("../src/lib/bolna/agent-config");
  const { assertAgentRoundTrip } = await import("../src/lib/bolna/verify");
  const { ensureActivePrompt } = await import("../src/lib/prompts");
  const { emitEvent } = await import("../src/lib/events");
  const { ensureProxyModelRegistered } =
    await import("../src/lib/bolna/sync-configured");
  const { maskPhone } = await import("../src/lib/phone");
  try {
    const env = { ...getEnv() };
    const baseIndex = process.argv.indexOf("--base-url");
    if (baseIndex >= 0) env.APP_BASE_URL = process.argv[baseIndex + 1];
    requirePublicBaseUrl(env.APP_BASE_URL);
    if (!env.DATABASE_URL) throw new Error("Missing DATABASE_URL");
    const client = getBolnaClient();
    const catalog = await client.listTtsProviders("hi");
    const provider = catalog.providers.find(
      (p) => p.slug === env.BOLNA_TTS_PROVIDER && p.is_supported,
    );
    const model = provider?.models.find(
      (m) =>
        m.model_id === env.BOLNA_TTS_MODEL &&
        m.is_supported &&
        !m.is_deprecated,
    );
    if (!provider || !model)
      throw new Error(
        "Configured TTS provider/model does not support Hindi in the current catalog",
      );
    const voices = [];
    for (let page = 1; page <= 100; page++) {
      const batch = await client.listVoices({
        provider_id: provider.id,
        model_id: model.id,
        language: "hi",
        page,
      });
      voices.push(...batch);
      if (batch.length < 100) break;
    }
    voices.sort((a, b) => {
      const rank = (v: typeof a) =>
        (/^(female|feminine)$/i.test(v.gender ?? "") ? 2 : 0) +
        (/enhi/i.test(v.voice_id) ? 1 : 0);
      return rank(b) - rank(a);
    });
    console.table(
      voices
        .slice(0, 5)
        .map((v) => ({ name: v.name, voice_id: v.voice_id, gender: v.gender })),
    );
    const selected = env.BOLNA_TTS_VOICE_ID
      ? voices.find((v) => v.voice_id === env.BOLNA_TTS_VOICE_ID)
      : voices[0];
    if (!selected)
      throw new Error(
        "Configured voice is absent from the selected model catalog",
      );
    if (!env.BOLNA_TTS_VOICE_ID) {
      env.BOLNA_TTS_VOICE_ID = selected.voice_id;
      appendConfig("BOLNA_TTS_VOICE_ID", selected.voice_id);
    }
    if (!env.BOLNA_TTS_VOICE) {
      env.BOLNA_TTS_VOICE = selected.name;
      appendConfig("BOLNA_TTS_VOICE", selected.name);
    }
    const numbers = await client.listPhoneNumbers();
    console.table(
      numbers.map((n) => ({
        number: maskPhone(n.phone_number),
        provider: n.telephony_provider ?? "account",
      })),
    );
    if (!env.BOLNA_FROM_NUMBER)
      console.log(
        "BOLNA_FROM_NUMBER is unset: /call will omit from_phone_number and use the account default.",
      );
    const agents = await client.listAgents();
    await ensureProxyModelRegistered(client, env);
    for (const key of ["collections", "brief"] as const) {
      const prompt = await ensureActivePrompt(key);
      const payload =
        key === "collections"
          ? buildCollectionsAgent(env, prompt.body)
          : buildBriefAgent(env, prompt.body);
      const envKey =
        key === "collections"
          ? "BOLNA_COLLECTIONS_AGENT_ID"
          : "BOLNA_BRIEF_AGENT_ID";
      // Recover a successful create if the previous process died before appending its ID.
      const matches = agents.filter(
        (a) => a.agent_name === payload.agent_config.agent_name,
      );
      if (!env[envKey] && matches.length > 1)
        throw new Error(`Multiple ${key} agents exist; configure ${envKey}`);
      let id = env[envKey] ?? matches[0]?.id;
      if (id) await client.updateAgent(id, payload);
      else id = (await client.createAgent(payload)).agent_id;
      if (!env[envKey]) {
        appendConfig(envKey, id);
        env[envKey] = id;
      }
      const hash = assertAgentRoundTrip(payload, await client.getAgent(id));
      await emitEvent("agent.synced", {
        payload: {
          agentKey: key,
          agentId: id,
          promptVersionId: prompt.id,
          promptHash: hash,
        },
      });
      console.log(
        `${key}: synced active prompt v${prompt.version}; GET round trip verified.`,
      );
    }
  } catch (error) {
    console.error(
      error instanceof BolnaError
        ? `Bolna sync failed (HTTP ${error.status}); response omitted to protect secrets.`
        : error instanceof Error && error.name !== "ZodError"
          ? error.message
          : "Bolna response did not match the documented schema.",
    );
    process.exitCode = 1;
  } finally {
    await closeDb();
  }
}
void main();
