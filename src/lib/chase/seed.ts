import { createHash } from "node:crypto";
import { and, eq, ne, sql } from "drizzle-orm";
import { getEnv } from "@/lib/env";
import { getDb, type Transaction } from "@/lib/db";
import * as s from "@/lib/db/schema";
import { formatIST } from "@/lib/time";
import { recomputeRating } from "./recompute";
import {
  DEMO_SEED_KEY,
  SEED_PORTFOLIO,
  profileStatus,
  type SeedProfile,
} from "./seed-portfolio";
const dayMs = 86_400_000;
const date = (at: Date) => formatIST(at, "yyyy-MM-dd");
const hash = (value: string) =>
  createHash("sha256").update(value).digest("hex");
export function fakePhone(index: number): string {
  return `+91900000${String(index + 1).padStart(4, "0")}`;
}
function conversation(profile: SeedProfile): string {
  const intro =
    "Agent: Namaste, main Shree Ganesh Traders ka AI assistant hoon. Kya main dukaan ke zimmedar vyakti se baat kar raha hoon?\nDebtor: Haan, boliye.\n";
  if (profile.kind === "unanswered")
    return "[SIMULATED] No answer; no debt information disclosed.";
  if (profile.kind === "wrong")
    return "[SIMULATED]\nAgent: Namaste, main ek AI assistant hoon. Kya yeh Vishwakarma Hardware hai?\nRecipient: Galat number hai.\nAgent: Maaf kijiye, hum number verify karenge.";
  const words: Partial<Record<SeedProfile["kind"], string>> = {
    demo: "पिछली बार आपने 5 तारीख बोला था।\nDebtor: Salary late hai. Abhi poora nahi de paunga, agle call par amount confirm karunga.",
    dispute:
      "Debtor: Maine salesman ko cash de diya tha. Receipt ki photo bhejunga.\nAgent: Hum owner se verify karayenge; tab tak collection follow-up rok rahe hain.",
    optout:
      "Debtor: Please mujhe dobara call mat karna.\nAgent: Aapka request record kar diya hai.",
    hardship:
      "Debtor: Ghar mein illness hai, thoda samay chahiye.\nAgent: Samajh gaya. Hum gently follow up karenge, koi pressure nahi.",
    reliable:
      "Debtor: Kal 3,000 UPI kar dunga.\nAgent: Thank you, promise record kar diya.",
    breaker: "Debtor: Is hafte bhi nahi ho payega. Baad mein baat karte hain.",
    promise:
      "Debtor: Do din mein 5,000 pay karunga.\nAgent: Theek hai, tab tak wait karenge.",
  };
  return `[SIMULATED]\n${intro}${words[profile.kind] ?? "Debtor: Ledger dekh kar payment arrange karunga.\nAgent: Dhanyavaad. Aap apni sahulat se bata dijiye."}`;
}
async function resetDemo(tx: Transaction) {
  const env = getEnv();
  const host = new URL(env.DATABASE_URL!).hostname;
  if (!env.DEMO_MODE || !["localhost", "127.0.0.1", "[::1]"].includes(host))
    throw new Error("Seed reset requires DEMO_MODE on a local database");
  const others = await tx
    .select({ id: s.businesses.id })
    .from(s.businesses)
    .where(sql`${s.businesses.seedKey} IS DISTINCT FROM ${DEMO_SEED_KEY}`)
    .limit(1);
  const realCalls = await tx
    .select({ id: s.calls.id })
    .from(s.calls)
    .where(
      sql`${s.calls.bolnaExecutionId} IS NULL OR ${s.calls.bolnaExecutionId} NOT LIKE 'seed-%'`,
    )
    .limit(1);
  const editedPrompts = await tx
    .select({ id: s.promptVersions.id })
    .from(s.promptVersions)
    .where(ne(s.promptVersions.createdBy, "seed"))
    .limit(1);
  if (others.length || realCalls.length || editedPrompts.length)
    throw new Error(
      "Reset refused: database contains non-seed business, call or prompt data",
    );
  // This explicit local-demo reset is the sole audit-log deletion path. The trigger
  // is restored inside the same transaction; failures roll everything back.
  await tx.execute(sql`ALTER TABLE events DISABLE TRIGGER events_no_truncate`);
  await tx.execute(
    sql`TRUNCATE TABLE events, briefs, compliance_events, call_turns, tool_invocations, messages, promises, callbacks, payments, payment_links, opt_outs, chase_ratings, contact_dossiers, calls, invoices, debtors, businesses, prompt_prs, prompt_versions, llm_calls RESTART IDENTITY`,
  );
  await tx.execute(sql`ALTER TABLE events ENABLE TRIGGER events_no_truncate`);
}
export async function seedPortfolio(
  options: { reset?: boolean; now?: Date } = {},
) {
  const env = getEnv();
  const now = options.now ?? new Date();
  // Keep fictional contact history inside the default 09:00–18:30 IST window.
  const historyAnchor = new Date(`${date(now)}T06:30:00Z`);
  const ago = (days: number) =>
    new Date(historyAnchor.getTime() - days * dayMs);
  const result = await getDb().transaction(async (tx) => {
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtext('chase-demo-seed'))`,
    );
    if (options.reset) await resetDemo(tx);
    const [existing] = await tx
      .select({ id: s.businesses.id })
      .from(s.businesses)
      .where(eq(s.businesses.seedKey, DEMO_SEED_KEY));
    if (existing) return { businessId: existing.id, created: false };
    const [business] = await tx
      .insert(s.businesses)
      .values({
        seedKey: DEMO_SEED_KEY,
        name: env.BUSINESS_NAME ?? "Shree Ganesh Traders",
        ownerName: env.OWNER_NAME ?? "Rakesh Agarwal",
        ownerPhone: env.OWNER_PHONE ?? "+919000009999",
        upiVpa: env.MERCHANT_UPI_VPA ?? null,
        city: "Pune",
        defaultLanguage: "hi",
      })
      .returning({ id: s.businesses.id });
    for (const agent of ["collections", "brief"] as const) {
      const body = `PART 4 PLACEHOLDER — ${agent}. Do not deploy. Always disclose AI identity; confirm identity before debt disclosure; no threats; respect opt-outs and allowed hours.`;
      await tx
        .insert(s.promptVersions)
        .values({
          agentKey: agent,
          version: 1,
          body,
          protectedHash: hash(body),
          createdBy: "seed",
          notes:
            "Placeholder only; real prompt and protected sections are written in Part 4.",
          isActive: false,
        })
        .onConflictDoNothing();
    }
    const [prompt] = await tx
      .select({ id: s.promptVersions.id })
      .from(s.promptVersions)
      .where(
        and(
          eq(s.promptVersions.agentKey, "collections"),
          eq(s.promptVersions.version, 1),
        ),
      );
    for (const [index, profile] of SEED_PORTFOLIO.entries()) {
      const phone =
        profile.kind === "demo"
          ? (env.DEMO_DEBTOR_PHONE ?? fakePhone(index))
          : fakePhone(index);
      if (profile.kind !== "demo" && env.DEMO_DEBTOR_PHONE === phone)
        throw new Error(
          "Demo phone conflicts with reserved fictional phone range",
        );
      const [debtor] = await tx
        .insert(s.debtors)
        .values({
          businessId: business.id,
          shopName: profile.shop,
          contactName: profile.contact,
          phoneE164: phone,
          preferredLanguage: profile.language,
          city: profile.city,
          segment: profile.segment,
          status: profileStatus(profile),
          notes: `Fictional demo portfolio. ${profile.kind === "dispute" ? "Paid cash to the salesman; receipt verification pending." : profile.kind === "hardship" ? "Family illness; gentle contact only, minimum 72-hour gap." : profile.kind === "demo" ? "Demo lead: salary delayed; one broken promise on the 5th." : "No live calls or payments represented."}`,
          firstContactDisclosedAt:
            profile.kind === "wrong" || profile.kind === "unanswered"
              ? null
              : ago(13),
          createdAt: ago(14),
          updatedAt: ago(1),
        })
        .returning({ id: s.debtors.id });
      const paidRupees =
        profile.kind === "reliable"
          ? 9000
          : profile.kind === "ordinary" && index % 3 === 0
            ? 1000
            : 0;
      const count = profile.kind === "demo" ? 2 : 1 + (index % 3);
      const splits =
        profile.kind === "demo"
          ? [7500, 5000]
          : Array.from({ length: count }, (_, i) =>
              i === count - 1
                ? profile.outstanding -
                  Math.floor(profile.outstanding / count) * (count - 1)
                : Math.floor(profile.outstanding / count),
            );
      for (const [i, balance] of splits.entries()) {
        const due = ago(Math.max(1, profile.dpd - i * 7));
        const paid = i === 0 ? paidRupees : 0;
        await tx.insert(s.invoices).values({
          businessId: business.id,
          debtorId: debtor.id,
          invoiceNo: `SGT-${String(index + 1).padStart(3, "0")}-${i + 1}`,
          issuedOn: date(new Date(due.getTime() - 15 * dayMs)),
          dueOn: date(due),
          amountPaise: BigInt(balance + paid) * 100n,
          paidPaise: BigInt(paid) * 100n,
          status: paid ? "partial" : "open",
          createdAt: new Date(due.getTime() - 15 * dayMs),
          updatedAt: ago(1),
        });
      }
      const callIds: string[] = [];
      for (const [idx, days] of profile.historyDays.entries()) {
        const at = ago(days);
        const connected = profile.kind !== "unanswered";
        const status = connected ? "completed" : "no-answer";
        const outcome =
          profile.kind === "demo"
            ? "follow_up"
            : profile.kind === "reliable" || profile.kind === "promise"
              ? "promise_to_pay"
              : profile.kind === "unanswered"
                ? "no_answer"
                : profile.kind;
        const [call] = await tx
          .insert(s.calls)
          .values({
            businessId: business.id,
            debtorId: debtor.id,
            purpose: "collection",
            bolnaExecutionId: `seed-${index + 1}-${idx + 1}`,
            bolnaAgentId: null,
            status,
            terminationReason: connected ? "normal_hangup" : "no_answer",
            connected,
            startedAt: at,
            endedAt: new Date(at.getTime() + (connected ? 72000 : 30000)),
            durationSec: connected ? 72 : 0,
            transcript: conversation(profile),
            costCents: 0n,
            timeToFirstAudioMs: connected ? 620 : null,
            language: profile.language,
            promptVersionId: prompt.id,
            analysis: {
              outcome,
              reason_code: profile.reason,
              sentiment: profile.sentiment,
              compliance_flags: [],
              simulated: true,
            },
            analysisModel: "seed-fixture",
            raw: { source: "seed", simulated: true },
            processedAt: new Date(at.getTime() + 80000),
            createdAt: at,
            updatedAt: at,
          })
          .returning({ id: s.calls.id });
        callIds.push(call.id);
        await tx.insert(s.events).values({
          type: connected ? "call.completed" : "call.no_answer",
          debtorId: debtor.id,
          callId: call.id,
          payload: { status, simulated: true },
          at,
          createdAt: at,
          updatedAt: at,
        });
        if (connected)
          await tx.insert(s.complianceEvents).values({
            debtorId: debtor.id,
            callId: call.id,
            kind: "ai_disclosed",
            rule: "ai_disclosure",
            detail: { source: "seed", simulated: true },
            at,
            createdAt: at,
            updatedAt: at,
          });
        await tx.insert(s.messages).values({
          debtorId: debtor.id,
          callId: call.id,
          toE164: phone,
          channel: "console",
          direction: "out",
          provider: "console",
          body: `[SIMULATED] Namaste ${profile.contact}, Shree Ganesh Traders se invoice follow-up. Kripya ledger check karein.`,
          status: "sent",
          createdAt: at,
          updatedAt: at,
        });
        await tx.insert(s.events).values({
          type: "message.sent",
          debtorId: debtor.id,
          callId: call.id,
          payload: { channel: "console", simulated: true },
          at,
          createdAt: at,
          updatedAt: at,
        });
      }
      if (profile.kind === "demo") {
        const today = date(now);
        let fifth = new Date(`${today.slice(0, 7)}-05T06:30:00+00:00`);
        if (fifth >= now)
          fifth = new Date(
            Date.UTC(fifth.getUTCFullYear(), fifth.getUTCMonth() - 1, 5, 6, 30),
          );
        await tx.insert(s.promises).values({
          debtorId: debtor.id,
          amountPaise: 500000n,
          promisedFor: date(fifth),
          reasonCode: "salary_delay",
          source: "manual",
          confirmed: true,
          status: "broken",
          resolvedAt: new Date(fifth.getTime() + dayMs),
          createdAt: new Date(fifth.getTime() - dayMs),
          updatedAt: new Date(fifth.getTime() + dayMs),
        });
      }
      if (profile.kind === "reliable" || profile.kind === "breaker") {
        for (let i = 0; i < 3; i++) {
          const at = ago(profile.historyDays[i]);
          const due = new Date(at.getTime() + dayMs);
          await tx.insert(s.promises).values({
            debtorId: debtor.id,
            callId: callIds[i],
            amountPaise: 300000n,
            promisedFor: date(due),
            reasonCode: profile.reason,
            source: "tool",
            confirmed: true,
            status: profile.kind === "reliable" ? "kept" : "broken",
            resolvedAt: due,
            createdAt: at,
            updatedAt: due,
          });
        }
      }
      if (profile.kind === "promise")
        await tx.insert(s.promises).values({
          debtorId: debtor.id,
          callId: callIds.at(-1),
          amountPaise: 500000n,
          promisedFor: date(ago(-2)),
          reasonCode: profile.reason,
          source: "tool",
          confirmed: true,
          status: "pending",
          createdAt: ago(2),
          updatedAt: ago(2),
        });
      if (paidRupees) {
        const pieces =
          profile.kind === "reliable" ? [3000, 3000, 3000] : [paidRupees];
        for (const [idx, amount] of pieces.entries()) {
          const at = ago(
            profile.kind === "reliable" ? profile.historyDays[idx] - 1 : 3,
          );
          const [link] = await tx
            .insert(s.paymentLinks)
            .values({
              debtorId: debtor.id,
              callId: callIds[Math.min(idx, callIds.length - 1)],
              amountPaise: BigInt(amount) * 100n,
              provider: "hosted",
              status: "paid",
              openedAt: at,
              paidAt: at,
              expiresAt: new Date(at.getTime() + dayMs),
              createdAt: new Date(at.getTime() - dayMs),
              updatedAt: at,
            })
            .returning({ id: s.paymentLinks.id });
          await tx.insert(s.payments).values({
            debtorId: debtor.id,
            paymentLinkId: link.id,
            amountPaise: BigInt(amount) * 100n,
            method: "upi",
            providerRef: `seed-payment-${index}-${idx}`,
            receivedAt: at,
            source: "simulated",
            createdAt: at,
            updatedAt: at,
          });
          await tx.insert(s.events).values({
            type: "payment.received",
            debtorId: debtor.id,
            payload: {
              amount_paise: String(amount * 100),
              source: "simulated",
            },
            at,
            createdAt: at,
            updatedAt: at,
          });
        }
      }
      if (profile.kind === "optout") {
        await tx.insert(s.optOuts).values({
          debtorId: debtor.id,
          scope: "all",
          reason: "Asked not to be contacted again",
          source: "call_tool",
          at: ago(12),
          createdAt: ago(12),
          updatedAt: ago(12),
        });
        await tx.insert(s.complianceEvents).values({
          debtorId: debtor.id,
          callId: callIds[0],
          kind: "opt_out",
          rule: "permanent_opt_out",
          detail: { simulated: true },
          at: ago(12),
          createdAt: ago(12),
          updatedAt: ago(12),
        });
      }
      if (profile.kind === "dispute")
        await tx.insert(s.complianceEvents).values({
          debtorId: debtor.id,
          callId: callIds[0],
          kind: "dispute_hold",
          rule: "human_review_required",
          detail: { reason: "Paid cash to the salesman", simulated: true },
          at: ago(3),
          createdAt: ago(3),
          updatedAt: ago(3),
        });
      await tx.insert(s.contactDossiers).values({
        debtorId: debtor.id,
        text:
          profile.kind === "demo"
            ? "Suresh Sharma runs Sharma General Store. ₹12,500 outstanding across two invoices. Salary delay; broke a ₹5,000 promise due on the 5th. Last call six days ago. Ask respectfully what is feasible; do not imply a new promise was confirmed."
            : `${profile.contact}, ${profile.shop}, ${profile.city}. Fictional portfolio. ${profile.kind === "hardship" ? "Family illness. Gentle check-in only; never more than once in 72 hours." : profile.kind === "dispute" ? "Disputes balance: says paid cash to salesman. Owner must verify before any collection." : "Review invoices and past conversations before contact."}`,
        preferredLanguage: profile.language,
        bestTimeWindow: index % 2 ? "afternoon" : "morning",
        toneHint: profile.kind === "hardship" ? "gentle" : "respectful",
        openCommitments:
          profile.kind === "promise"
            ? [{ amount_paise: "500000", date: date(ago(-2)) }]
            : [],
        doNotMention: ["third-party account details"],
        sourceHash: hash(profile.shop),
        model: "seed-fixture",
      });
    }
    return { businessId: business.id, created: true };
  });
  if (result.created) {
    const debtors = await getDb()
      .select({ id: s.debtors.id })
      .from(s.debtors)
      .where(eq(s.debtors.businessId, result.businessId));
    for (const debtor of debtors) await recomputeRating(debtor.id, now);
  }
  return result;
}
