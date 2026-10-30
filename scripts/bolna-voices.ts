import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd(), true, { info() {}, error() {} });

function flag(name: string, fallback?: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index > -1 ? process.argv[index + 1] : fallback;
}

/** Prints the account's own voice catalog so a voice is chosen, never invented. */
async function main() {
  const { getEnv } = await import("../src/lib/env");
  const { getBolnaClient } = await import("../src/lib/bolna/client");
  const { voiceOptions, modelsFor } = await import("../src/lib/bolna/voices");
  const env = getEnv();
  const provider = flag("provider", env.BOLNA_TTS_PROVIDER)!;
  const language = flag("language", "hi")!;
  const model = flag("model");
  const voices = await getBolnaClient().listVoices();
  console.log(
    `${provider} models in this account's catalog: ${modelsFor(voices, provider).join(", ") || "none"}`,
  );
  const options = voiceOptions(voices, { provider, model, language });
  console.table(
    options.map((v) => ({
      model: v.model,
      voice_id: v.voice_id,
      name: v.name,
      language: v.language_code,
      accent: v.accent,
    })),
  );
  console.log(
    `${options.length} voices for language "${language}". Set BOLNA_TTS_MODEL, BOLNA_TTS_VOICE and BOLNA_TTS_VOICE_ID in .env from one row.`,
  );
}

void main().catch((error) => {
  console.error(
    `Voice catalog failed: ${error instanceof Error ? error.message : "unknown error"}`,
  );
  process.exitCode = 1;
});
