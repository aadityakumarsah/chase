import { z } from "zod";
import { type BolnaProvider, type BolnaVoice } from "./client";

/**
 * Voices are never invented: the configured provider/model/voice must exist in
 * the account's own catalog (GET /me/voices) before an agent is created.
 */
export type ResolvedVoice = {
  provider: string;
  model: string;
  voice: string;
  voiceId: string;
  languageCode: string | null;
};

const langPrefix = (code: string | null | undefined) =>
  (code ?? "").toLowerCase().split(/[-_]/)[0];

export function voicesFor(
  voices: BolnaVoice[],
  input: { provider: string; model?: string; language?: string },
): BolnaVoice[] {
  const provider = input.provider.toLowerCase();
  const language = input.language?.toLowerCase();
  return voices.filter(
    (v) =>
      v.provider.toLowerCase() === provider &&
      (!input.model || v.model === input.model) &&
      (!language || langPrefix(v.language_code) === langPrefix(language)),
  );
}

export function modelsFor(voices: BolnaVoice[], provider: string): string[] {
  return [
    ...new Set(
      voicesFor(voices, { provider })
        .map((v) => v.model)
        .filter((m): m is string => !!m),
    ),
  ].sort();
}

export function pickVoice(
  voices: BolnaVoice[],
  input: {
    provider: string;
    model: string;
    voiceId: string;
    language?: string;
  },
): ResolvedVoice {
  const provider = z.string().min(1).parse(input.provider);
  const model = z.string().min(1).parse(input.model);
  const voiceId = z.string().min(1).parse(input.voiceId);
  const byProvider = voicesFor(voices, { provider });
  if (!byProvider.length)
    throw new Error(
      `Voice provider "${provider}" has no voices in this account's catalog. Available providers: ${[
        ...new Set(voices.map((v) => v.provider)),
      ]
        .sort()
        .join(", ")}`,
    );
  const byModel = voicesFor(voices, { provider, model });
  if (!byModel.length)
    throw new Error(
      `Voice model "${model}" is not in this account's catalog for "${provider}". Available models: ${modelsFor(
        voices,
        provider,
      ).join(", ")}`,
    );
  const matches = byModel.filter(
    (v) => v.voice_id.toLowerCase() === voiceId.toLowerCase(),
  );
  if (!matches.length)
    throw new Error(
      `Voice "${voiceId}" is not in this account's catalog for ${provider} ${model}. First options: ${[
        ...new Set(byModel.map((v) => v.voice_id)),
      ]
        .sort()
        .slice(0, 12)
        .join(", ")}`,
    );
  // Prefer the row for the call language so the catalogued accent is the one used.
  const preferred =
    (input.language &&
      matches.find(
        (v) => langPrefix(v.language_code) === langPrefix(input.language),
      )) ||
    matches[0];
  return {
    provider: preferred.provider,
    model,
    voice: preferred.name,
    voiceId: preferred.voice_id,
    languageCode: preferred.language_code ?? null,
  };
}

export async function resolveVoice(
  client: BolnaProvider,
  input: {
    provider: string;
    model: string;
    voiceId: string;
    language?: string;
  },
): Promise<ResolvedVoice> {
  return pickVoice(await client.listVoices(), input);
}

/** Distinct voices for an operator to choose from, newest catalog first. */
export function voiceOptions(
  voices: BolnaVoice[],
  input: { provider: string; model?: string; language?: string },
) {
  const seen = new Set<string>();
  return voicesFor(voices, input).filter((v) => {
    const key = `${v.model}:${v.voice_id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
