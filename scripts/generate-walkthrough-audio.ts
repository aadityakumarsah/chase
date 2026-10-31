import { loadEnvConfig } from "@next/env";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { walkthroughLines } from "../src/lib/marketing/walkthrough";

loadEnvConfig(process.cwd(), true, { info() {}, error() {} });

// A one-time TTS render: browsers serve committed MP3s; neither Bolna nor an LLM
// is called by the public page. Use the voice ID configured for Bolna's Sarvam TTS.
async function main() {
  const key = process.env.SARVAM_API_KEY;
  const voice = process.env.BOLNA_TTS_VOICE_ID;
  if (!key || !voice)
    throw new Error(
      "Set SARVAM_API_KEY privately and BOLNA_TTS_VOICE_ID before recording",
    );
  if (
    process.env.BOLNA_TTS_PROVIDER &&
    process.env.BOLNA_TTS_PROVIDER !== "sarvam"
  )
    throw new Error(
      "This recorder supports only a Sarvam-configured Bolna voice",
    );
  const model = process.env.BOLNA_TTS_MODEL || "bulbul:v4-flash";
  const responseSchema = z.object({
    audios: z.array(z.string().min(1)).min(1),
  });
  const folder = path.join(process.cwd(), "public/audio");
  await mkdir(folder, { recursive: true });
  for (const [index, text] of walkthroughLines.entries()) {
    const response = await fetch("https://api.sarvam.ai/text-to-speech", {
      method: "POST",
      headers: {
        "api-subscription-key": key,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text,
        language_code: "hi-IN",
        speaker: voice,
        model,
        output_audio_codec: "mp3",
        speech_sample_rate: 24000,
      }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok)
      throw new Error(
        `Sarvam recording failed for step ${index + 1} (HTTP ${response.status}); check voice/model/plan`,
      );
    const parsed = responseSchema.safeParse(await response.json());
    if (!parsed.success)
      throw new Error(
        `Sarvam returned an unexpected recording for step ${index + 1}`,
      );
    const audio = Buffer.from(parsed.data.audios[0], "base64");
    if (audio.length < 1000 || audio.length > 5_000_000)
      throw new Error(
        `Sarvam returned an invalid audio size for step ${index + 1}`,
      );
    await writeFile(
      path.join(
        folder,
        `walkthrough-${String(index + 1).padStart(2, "0")}.mp3`,
      ),
      audio,
    );
    console.log(`Recorded step ${index + 1} (${audio.length} bytes)`);
  }
  await writeFile(
    path.join(process.cwd(), "src/lib/marketing/audio-manifest.ts"),
    "/** Recorded in the configured Bolna Sarvam voice; no runtime TTS calls. */\nexport const hasBolnaVoiceRecording = true;\n",
  );
}
void main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Recording failed");
  process.exitCode = 1;
});
