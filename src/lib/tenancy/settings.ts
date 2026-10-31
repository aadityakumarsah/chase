import { createHash, randomInt, timingSafeEqual } from "node:crypto";
import { and, desc, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { businesses, phoneVerifications } from "@/lib/db/schema";
import { emitEvent } from "@/lib/events";
import { enqueueMessage, deliverMessage } from "@/lib/messaging";
import { e164Schema } from "@/lib/phone";
import { upiVpaSchema } from "./onboarding";

/** Everything a workspace can change about itself. */
export const workspaceSettingsSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  ownerName: z.string().trim().min(2).max(120).optional(),
  ownerPhone: e164Schema.optional(),
  city: z.string().trim().min(2).max(80).optional(),
  defaultLanguage: z.enum(["hi", "en", "mr"]).optional(),
  upiVpa: upiVpaSchema.nullable().optional(),
  merchantName: z.string().trim().min(2).max(120).nullable().optional(),
  // Hard statutory bounds are enforced again by a database check constraint.
  callWindowStart: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .refine((v) => v >= "08:00" && v < "19:00")
    .optional(),
  callWindowEnd: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .refine((v) => v > "08:00" && v <= "19:00")
    .optional(),
  maxAttemptsPerDay: z.coerce.number().int().min(1).max(5).optional(),
  maxAttemptsPerWeek: z.coerce.number().int().min(1).max(20).optional(),
  minGapHours: z.coerce.number().int().min(0).max(72).optional(),
});

export async function getWorkspaceSettings(businessId: string) {
  const [row] = await getDb()
    .select()
    .from(businesses)
    .where(eq(businesses.id, businessId));
  if (!row) throw new Error("Workspace not found");
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    plan: row.plan,
    status: row.status,
    trialEndsAt: row.trialEndsAt?.toISOString() ?? null,
    ownerName: row.ownerName,
    ownerPhone: row.ownerPhone,
    ownerPhoneVerified: Boolean(row.ownerPhoneVerifiedAt),
    city: row.city,
    defaultLanguage: row.defaultLanguage,
    upiVpa: row.upiVpa,
    merchantName: row.merchantName,
    callWindowStart: row.callWindowStart.slice(0, 5),
    callWindowEnd: row.callWindowEnd.slice(0, 5),
    maxAttemptsPerDay: row.maxAttemptsPerDay,
    maxAttemptsPerWeek: row.maxAttemptsPerWeek,
    minGapHours: row.minGapHours,
    contactPolicyAcceptedAt: row.contactPolicyAcceptedAt?.toISOString() ?? null,
  };
}

export async function updateWorkspaceSettings(
  businessId: string,
  input: z.input<typeof workspaceSettingsSchema>,
) {
  const value = workspaceSettingsSchema.parse(input);
  const patch: Record<string, unknown> = { ...value, updatedAt: new Date() };

  // Changing the owner's number invalidates the proof that they control it.
  if (value.ownerPhone) {
    const [current] = await getDb()
      .select({ ownerPhone: businesses.ownerPhone })
      .from(businesses)
      .where(eq(businesses.id, businessId));
    if (current && current.ownerPhone !== value.ownerPhone)
      patch.ownerPhoneVerifiedAt = null;
  }

  const [updated] = await getDb()
    .update(businesses)
    .set(patch)
    .where(eq(businesses.id, businessId))
    .returning();

  await emitEvent("workspace.updated", {
    businessId,
    // Field names only: never the values, which include contact details.
    payload: { fields: Object.keys(value) },
  });
  return updated;
}

const OTP_TTL_MINUTES = 10;
const OTP_MAX_ATTEMPTS = 5;
const hashCode = (code: string, phone: string) =>
  createHash("sha256").update(`${phone}:${code}`).digest("hex");

/**
 * Sends a one-time code to prove the workspace controls the number Chase will
 * call. Only the hash is stored, and the code is never logged or returned.
 */
export async function sendPhoneVerification(
  businessId: string,
  phone: string,
  requestedByUserId: string,
) {
  const to = e164Schema.parse(phone);
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  const db = getDb();

  await db.insert(phoneVerifications).values({
    businessId,
    phoneE164: to,
    purpose: "owner_phone",
    codeHash: hashCode(code, to),
    expiresAt: new Date(Date.now() + OTP_TTL_MINUTES * 60_000),
    requestedByUserId,
  });

  const message = await enqueueMessage({
    businessId,
    to,
    text: `${code} is your Chase verification code. It expires in ${OTP_TTL_MINUTES} minutes.`,
    kind: "phone_verification",
  });
  await deliverMessage(message.id);
  return { sent: true, expiresInMinutes: OTP_TTL_MINUTES };
}

export async function confirmPhoneVerification(
  businessId: string,
  phone: string,
  code: string,
) {
  const to = e164Schema.parse(phone);
  const db = getDb();
  const [pending] = await db
    .select()
    .from(phoneVerifications)
    .where(
      and(
        eq(phoneVerifications.businessId, businessId),
        eq(phoneVerifications.phoneE164, to),
        isNull(phoneVerifications.verifiedAt),
      ),
    )
    .orderBy(desc(phoneVerifications.createdAt))
    .limit(1);

  if (!pending) return { ok: false as const, reason: "not_requested" as const };
  if (pending.expiresAt.getTime() < Date.now())
    return { ok: false as const, reason: "expired" as const };
  if (pending.attempts >= OTP_MAX_ATTEMPTS)
    return { ok: false as const, reason: "too_many_attempts" as const };

  const expected = Buffer.from(pending.codeHash);
  const supplied = Buffer.from(hashCode(code.trim(), to));
  const matches =
    expected.length === supplied.length && timingSafeEqual(expected, supplied);

  if (!matches) {
    await db
      .update(phoneVerifications)
      .set({ attempts: pending.attempts + 1 })
      .where(eq(phoneVerifications.id, pending.id));
    return { ok: false as const, reason: "incorrect" as const };
  }

  const now = new Date();
  await db.transaction(async (tx) => {
    await tx
      .update(phoneVerifications)
      .set({ verifiedAt: now })
      .where(eq(phoneVerifications.id, pending.id));
    await tx
      .update(businesses)
      .set({ ownerPhoneVerifiedAt: now, updatedAt: now })
      .where(eq(businesses.id, businessId));
  });

  await emitEvent("workspace.phone_verified", {
    businessId,
    payload: { purpose: "owner_phone" },
  });
  return { ok: true as const };
}
