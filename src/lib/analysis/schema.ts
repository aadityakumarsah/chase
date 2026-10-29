import { z } from "zod";
export const CallAnalysisSchema = z
  .strictObject({
    connected: z.boolean(),
    outcome: z.enum([
      "ptp_made",
      "partial_paid",
      "paid_in_full",
      "dispute_raised",
      "hardship",
      "callback_requested",
      "refused",
      "wrong_number",
      "third_party_answered",
      "opted_out",
      "escalated_to_owner",
      "no_conversation",
      "voicemail",
    ]),
    language_used: z.enum(["hi", "en", "mr", "mixed"]),
    promise: z
      .strictObject({
        made: z.boolean(),
        amount_rupees: z.number().int().nonnegative().safe(),
        date: z.union([z.iso.date(), z.literal("")]),
      })
      .refine(
        (p) =>
          p.made
            ? p.amount_rupees > 0 && p.date !== ""
            : p.amount_rupees === 0 && p.date === "",
        "Promise fields must agree with made",
      ),
    reason_code: z.enum([
      "salary_delay",
      "cash_flow",
      "dispute",
      "hardship",
      "avoidance",
      "paid_already",
      "wrong_number",
      "unknown",
    ]),
    sentiment: z.enum(["positive", "neutral", "negative", "hostile"]),
    debtor_statements: z.array(z.string().max(240)).max(5),
    objections: z.array(z.string().max(240)).max(5),
    ai_disclosed: z.boolean(),
    identity_confirmed_before_dues: z.boolean(),
    compliance_flags: z
      .array(
        z.strictObject({
          type: z.enum([
            "outside_window",
            "pressure_or_threat",
            "third_party_disclosure",
            "misrepresentation",
            "ignored_opt_out",
            "rude_language",
            "other",
          ]),
          evidence: z.string().max(240),
          severity: z.enum(["low", "medium", "high"]),
        }),
      )
      .max(20),
    agent_quality: z.strictObject({
      score: z.number().int().min(1).max(5),
      worked: z.string().max(400),
      failed: z.string().max(400),
    }),
    next_best_action: z.enum([
      "wait_for_promise",
      "call_back",
      "send_reminder",
      "human_review",
      "stop_contact",
      "verify_number",
      "none",
    ]),
    owner_summary: z
      .string()
      .max(500)
      .describe("At most two sentences in plain English, no jargon")
      .refine(
        (v) => (v.match(/[^.!?]+[.!?]+|[^.!?]+$/g) ?? []).length <= 2,
        "At most two sentences",
      ),
    dossier_update: z
      .string()
      .max(600)
      .describe("At most three short lines of new facts")
      .refine((v) => v.split(/\r?\n/).length <= 3, "At most three lines"),
  })
  .superRefine((value, ctx) => {
    if (
      value.outcome === "opted_out" &&
      value.next_best_action !== "stop_contact"
    )
      ctx.addIssue({
        code: "custom",
        path: ["next_best_action"],
        message: "Opt-out requires stop_contact",
      });
    if (
      value.outcome === "wrong_number" &&
      value.next_best_action !== "verify_number"
    )
      ctx.addIssue({
        code: "custom",
        path: ["next_best_action"],
        message: "Wrong number requires verification",
      });
    if (value.outcome === "ptp_made" && !value.promise.made)
      ctx.addIssue({
        code: "custom",
        path: ["promise"],
        message: "Promise outcome requires a dated promise",
      });
  });
export type CallAnalysis = z.infer<typeof CallAnalysisSchema>;
