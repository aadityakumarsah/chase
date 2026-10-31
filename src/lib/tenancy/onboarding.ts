import { z } from "zod";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { businesses, orgMembers } from "@/lib/db/schema";
import { e164Schema } from "@/lib/phone";
import { emitEvent } from "@/lib/events";

/** UPI virtual payment address, e.g. `shop@okhdfcbank`. */
export const upiVpaSchema = z
  .string()
  .trim()
  .min(3)
  .max(120)
  .regex(/^[\w.\-]{2,64}@[A-Za-z]{2,32}$/, "Enter a valid UPI ID");

export const createWorkspaceSchema = z.object({
  name: z.string().trim().min(2).max(120),
  ownerName: z.string().trim().min(2).max(120),
  ownerPhone: e164Schema,
  city: z.string().trim().min(2).max(80),
  defaultLanguage: z.enum(["hi", "en", "mr"]).default("hi"),
  upiVpa: upiVpaSchema.optional(),
  merchantName: z.string().trim().min(2).max(120).optional(),
  /** Explicit acceptance of the contact-conduct policy by a named person. */
  contactPolicyAccepted: z.literal(true),
});

export type CreateWorkspaceInput = z.input<typeof createWorkspaceSchema>;

const slugify = (value: string) =>
  value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 48) || "workspace";

/**
 * Creates a workspace and makes the signed-in user its owner, in one
 * transaction. Everything the single-tenant build read from environment
 * variables — business name, owner, calling window, merchant UPI — is captured
 * here as tenant data instead.
 */
export async function createWorkspace(
  userId: string,
  input: CreateWorkspaceInput,
) {
  const value = createWorkspaceSchema.parse(input);
  const db = getDb();

  const business = await db.transaction(async (tx) => {
    // Slugs are cosmetic but must be unique; probe with a short numeric suffix.
    const base = slugify(value.name);
    let slug = base;
    for (let attempt = 1; attempt < 50; attempt++) {
      const [taken] = await tx
        .select({ id: businesses.id })
        .from(businesses)
        .where(eq(businesses.slug, slug))
        .limit(1);
      if (!taken) break;
      slug = `${base}-${attempt + 1}`;
    }

    const [created] = await tx
      .insert(businesses)
      .values({
        name: value.name,
        slug,
        ownerUserId: userId,
        ownerName: value.ownerName,
        ownerPhone: value.ownerPhone,
        city: value.city,
        defaultLanguage: value.defaultLanguage,
        upiVpa: value.upiVpa ?? null,
        merchantName: value.merchantName ?? value.name,
        status: "active",
        plan: "trial",
        onboardedAt: new Date(),
        // 14-day trial from creation; billing enforcement is a later milestone.
        trialEndsAt: new Date(Date.now() + 14 * 86_400_000),
        contactPolicyAcceptedAt: new Date(),
        contactPolicyAcceptedBy: userId,
      })
      .returning();

    await tx.insert(orgMembers).values({
      businessId: created.id,
      userId,
      role: "owner",
      status: "active",
    });

    return created;
  });

  await emitEvent("workspace.created", {
    businessId: business.id,
    payload: {
      name: business.name,
      slug: business.slug,
      plan: business.plan,
      hasUpi: Boolean(business.upiVpa),
    },
  });

  return business;
}
