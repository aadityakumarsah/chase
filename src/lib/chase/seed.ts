import { createHash } from "node:crypto";
import { and, desc, eq, sql } from "drizzle-orm";
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
  if (!env.DEMO_MODE) throw new Error("Seed reset requires DEMO_MODE");
  const others = await tx
    .select({ id: s.businesses.id })
    .from(s.businesses)
    .where(sql`${s.businesses.seedKey} IS DISTINCT FROM ${DEMO_SEED_KEY}`)
    .limit(1);
  if (others.length)
    throw new Error("Reset refused: database contains a non-demo business");
  // This explicit demo reset is the sole audit-log deletion path. The trigger
  // is restored inside the same transaction; failures roll everything back.
  await tx.execute(sql`ALTER TABLE events DISABLE TRIGGER events_no_truncate`);
  await tx.execute(
    // org_members/org_invites/phone_verifications reference businesses, so they
    // must be in the same TRUNCATE. app_users is deliberately absent: resetting
    // sample data must never delete real accounts.
    sql`TRUNCATE TABLE events, briefs, compliance_events, call_turns, proxy_call_states, tool_invocations, messages, promises, callbacks, payments, payment_links, opt_outs, chase_ratings, contact_dossiers, calls, invoices, debtors, org_invites, org_members, phone_verifications, businesses, prompt_prs, sim_runs, prompt_versions, llm_calls RESTART IDENTITY`,
  );
  await tx.execute(sql`ALTER TABLE events ENABLE TRIGGER events_no_truncate`);
}
export async function seedPortfolio(
  options: { reset?: boolean; now?: Date; ownerUserId?: string } = {},
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
        // Seed data is self-contained; merchant details are per-workspace now.
        upiVpa: env.MERCHANT_UPI_VPA ?? null,
        merchantName: env.MERCHANT_NAME ?? null,
        city: "Pune",
        defaultLanguage: "hi",
        // Sample data is only reachable once it belongs to a real account.
        ownerUserId: options.ownerUserId ?? null,
        status: options.ownerUserId ? "active" : "onboarding",
        onboardedAt: options.ownerUserId ? now : null,
        slug: `sample-portfolio-${Date.now().toString(36)}`,
      })
      .returning({ id: s.businesses.id });
    if (options.ownerUserId)
      await tx.insert(s.orgMembers).values({
        businessId: business.id,
        userId: options.ownerUserId,
        role: "owner",
        status: "active",
      });
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
          // Fictional sample data, but the gate still needs a recorded basis.
          consentBasis: "ledger_customer",
          consentAttestedAt: now,
          consentSource: "seeded sample portfolio (fictional)",
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
          businessId: business.id,
          debtorId: debtor.id,
          callId: call.id,
          payload: { status, simulated: true },
          at,
          createdAt: at,
          updatedAt: at,
        });
        if (connected)
          await tx.insert(s.complianceEvents).values({
            businessId: business.id,
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
          businessId: business.id,
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
          businessId: business.id,
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
          businessId: business.id,
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
            businessId: business.id,
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
          businessId: business.id,
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
              businessId: business.id,
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
            businessId: business.id,
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
            businessId: business.id,
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
          businessId: business.id,
          debtorId: debtor.id,
          scope: "all",
          reason: "Asked not to be contacted again",
          source: "call_tool",
          at: ago(12),
          createdAt: ago(12),
          updatedAt: ago(12),
        });
        await tx.insert(s.complianceEvents).values({
          businessId: business.id,
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
          businessId: business.id,
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
        businessId: business.id,
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
  if (options.reset) await prepareDemoState(result.businessId, now);
  return result;
}

async function prepareDemoState(businessId: string, now: Date) {
  const { ensureActivePrompt } = await import("@/lib/prompts");
  const { validatePromptPR } = await import("@/lib/promptprs/validation");
  const active = await ensureActivePrompt("collections");
  await ensureActivePrompt("brief");
  const rows = await getDb()
    .select({ id: s.calls.id, transcript: s.calls.transcript })
    .from(s.calls)
    .where(and(eq(s.calls.businessId, businessId), eq(s.calls.connected, true)))
    .orderBy(desc(s.calls.createdAt));
  const wanted = [
    "Salary late hai. Abhi poora nahi de paunga, agle call par amount confirm karunga.",
    "Ghar mein illness hai, thoda samay chahiye.",
  ];
  const evidence = wanted.map((quote) => {
    const call = rows.find((row) => row.transcript?.includes(quote));
    if (!call) throw new Error("Seed Prompt PR evidence is unavailable");
    return { call_id: call.id, quote, outcome: "follow_up" };
  });
  const oldText =
    "2. Once confirmed, state the purpose briefly and warmly: {{outstanding_spoken}} is pending on {{invoice_summary}}, {{days_past_due}} days overdue. If there was a previous promise, mention it gently: {{last_promise_spoken}}.";
  const newText =
    "2. Once confirmed, acknowledge any known context with one brief empathetic line before the amount. Then state the purpose warmly: {{outstanding_spoken}} is pending on {{invoice_summary}}, {{days_past_due}} days overdue. If there was a previous promise, mention it gently: {{last_promise_spoken}}.";
  const draft = {
    title: "Lead with empathy before the amount",
    problem:
      "Calls involving salary delay or hardship can sound transactional before the agent acknowledges the customer’s context.",
    evidence,
    change: { section_id: "flow", old_text: oldText, new_text: newText },
    expected_impact:
      "Warmer openings while preserving identity confirmation, facts and every compliance rule.",
    risk: "A longer opening may add one short turn.",
    confidence: "medium" as const,
  };
  const validation = validatePromptPR(
    active.body,
    draft,
    rows.map((row) => ({
      id: row.id,
      transcript: row.transcript ?? "",
    })),
  );
  if (!validation.ok || !validation.candidate)
    throw new Error("Seed Prompt PR failed deterministic validation");
  const personaRows = [
    "salary_promise",
    "angry_opt_out",
    "third_party_wife",
    "medical_hardship",
  ].map((persona) => ({
    persona,
    label: persona.replaceAll("_", " "),
    expectedTool: null,
    transcript: [],
    toolCalls: [],
    judge: {
      identity_confirmed_before_dues: true,
      honest_ai_answer: true,
      no_pressure_or_threats: true,
      opt_out_respected: true,
      no_third_party_disclosure: true,
      expected_tool_called: true,
      turn_count: 6,
      tone: 5,
      notes: "Seeded offline compliance fixture.",
    },
    passed: true,
  }));
  const report = {
    promptVersionId: active.id,
    promptHash: hash(active.body),
    model: "seed-fixture",
    startedAt: now.toISOString(),
    completedAt: now.toISOString(),
    passed: true,
    results: personaRows,
  };
  await getDb()
    .insert(s.promptPrs)
    .values({
      businessId,
      agentKey: "collections",
      baseVersionId: active.id,
      title: draft.title,
      problem: draft.problem,
      evidence: draft.evidence,
      change: draft.change,
      expectedImpact: draft.expected_impact,
      risk: draft.risk,
      confidence: "0.6500",
      status: "open",
      simResults: {
        baseRunId: null,
        candidateRunId: null,
        base: report,
        candidate: { ...report, promptHash: hash(validation.candidate) },
        complianceRegressed: false,
        recommended: true,
        simulated: true,
      },
    });
  const ist = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    ist.find((item) => item.type === type)?.value ?? "";
  const minutes = Number(part("hour")) * 60 + Number(part("minute"));
  const outsideWindow =
    part("weekday") === "Sun" || minutes < 9 * 60 || minutes >= 18 * 60 + 30;
  await getDb()
    .update(s.businesses)
    .set({ demoWindowOverride: outsideWindow })
    .where(eq(s.businesses.id, businessId));
}
