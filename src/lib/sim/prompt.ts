import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { loadCallContext } from "@/lib/calls/context";
import { getDb } from "@/lib/db";
import { contactDossiers, debtors, promptVersions } from "@/lib/db/schema";
import { toCallVariables } from "@/lib/dossier";
import { activePrompt, renderPrompt } from "@/lib/prompts";
import { WELCOME_MESSAGE } from "@/lib/bolna/agent-config";
import { SIM_ACCOUNT_ID, SIM_CALL_TOKEN } from "./tools";

export type SimulationPrompt = {
  source: string;
  rendered: string;
  welcome: string;
  promptVersionId: string | null;
  promptHash: string;
};

function interpolate(
  template: string,
  values: Record<string, string | number>,
) {
  const output = template.replace(/\{\{([a-z][a-z0-9_]*)\}\}/g, (_, key) => {
    if (!(key in values)) throw new Error(`Missing simulator variable: ${key}`);
    return String(values[key]);
  });
  if (/\{\{[a-z][a-z0-9_]*\}\}/.test(output))
    throw new Error("Unresolved simulator prompt variable");
  return output;
}

export async function resolveSimulationPrompt(
  selector: string = "active",
  sourceOverride?: string,
): Promise<SimulationPrompt> {
  let source: string;
  let promptVersionId: string | null = null;
  if (sourceOverride) source = sourceOverride;
  else if (selector === "active") {
    const prompt = await activePrompt("collections");
    source = prompt.body;
    promptVersionId = prompt.id;
  } else {
    const version = /^\d+$/.test(selector) ? Number(selector) : null;
    const [prompt] = await getDb()
      .select()
      .from(promptVersions)
      .where(
        version === null
          ? and(
              eq(promptVersions.agentKey, "collections"),
              eq(promptVersions.id, z.uuid().parse(selector)),
            )
          : and(
              eq(promptVersions.agentKey, "collections"),
              eq(
                promptVersions.version,
                z.number().int().positive().parse(version),
              ),
            ),
      );
    if (!prompt) throw new Error("Collections prompt version not found");
    source = prompt.body;
    promptVersionId = prompt.id;
  }

  const [seed] = await getDb()
    .select({ id: debtors.id })
    .from(debtors)
    .where(eq(debtors.shopName, "Sharma General Store"))
    .limit(1);
  if (!seed) throw new Error("Seed Sharma debtor is required for simulation");
  const context = await loadCallContext(seed.id);
  const [dossier] = await getDb()
    .select({ text: contactDossiers.text })
    .from(contactDossiers)
    .where(eq(contactDossiers.debtorId, seed.id));
  const values = {
    ...toCallVariables({
      debtor: context.callDebtor,
      dossier: { text: dossier?.text ?? context.dossierText },
      rating: { score: context.ratingScore },
      callToken: SIM_CALL_TOKEN,
      language: context.language,
      today: context.today,
    }),
    account_id: SIM_ACCOUNT_ID,
    call_token: SIM_CALL_TOKEN,
  };
  return {
    source,
    rendered: interpolate(renderPrompt(source), values),
    welcome: interpolate(WELCOME_MESSAGE, values),
    promptVersionId,
    promptHash: createHash("sha256").update(source).digest("hex"),
  };
}
