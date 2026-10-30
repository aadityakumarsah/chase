import { evaluateDebtorContact } from "@/lib/compliance/contact";
import { toCallVariables } from "@/lib/dossier";
import { getEnv } from "@/lib/env";
import { maskPhone, normalisePhone } from "@/lib/phone";
import { loadCallContext } from "./context";
import { startCollectionCall } from "./dial";

export { syncedCollectionsPrompt } from "./prompt";

/** Backward-compatible explicit test entry point. */
export async function dispatchCall(
  debtorId: string,
  options: { to?: string } = {},
) {
  if (options.to) {
    const context = await loadCallContext(debtorId);
    if (normalisePhone(options.to) !== context.debtor.phoneE164)
      throw new Error("Recipient override must match the debtor ledger number");
  }
  return startCollectionCall(debtorId, { source: "manual" });
}

export async function previewCall(debtorId: string) {
  const context = await loadCallContext(debtorId);
  const env = getEnv();
  const { decision } = await evaluateDebtorContact(debtorId, { record: false });
  const variables = toCallVariables({
    debtor: context.callDebtor,
    dossier: { text: context.dossierText },
    rating: { score: context.ratingScore },
    callToken: "0".repeat(64),
    language: context.language,
    today: context.today,
  });
  return {
    decision,
    request: {
      agent_id: env.BOLNA_COLLECTIONS_AGENT_ID ?? null,
      recipient_phone_number: maskPhone(context.debtor.phoneE164),
      user_data: { ...variables, call_token: "<generated server-side>" },
    },
  };
}
