import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireMember } from "@/lib/tenancy/guard";
import {
  confirmPhoneVerification,
  sendPhoneVerification,
} from "@/lib/tenancy/settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.union([
  z.object({ action: z.literal("send"), phone: z.string().min(8).max(20) }),
  z.object({
    action: z.literal("confirm"),
    phone: z.string().min(8).max(20),
    code: z.string().regex(/^\d{6}$/),
  }),
]);

const REASONS: Record<string, string> = {
  not_requested: "Request a new code first.",
  expired: "That code has expired. Send a new one.",
  too_many_attempts: "Too many incorrect attempts. Send a new code.",
  incorrect: "That code is not correct.",
};

/**
 * Proves the workspace controls the number Chase will call. Until this passes,
 * the production contact gate refuses to dial the owner's brief.
 */
export async function POST(request: NextRequest) {
  const auth = await requireMember(request, {
    mutation: true,
    minRole: "admin",
  });
  if (!auth.ok) return auth.response;

  const body = bodySchema.safeParse(await request.json());
  if (!body.success)
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  try {
    if (body.data.action === "send")
      return NextResponse.json(
        await sendPhoneVerification(
          auth.businessId,
          body.data.phone,
          auth.session.user.id,
        ),
      );
    const result = await confirmPhoneVerification(
      auth.businessId,
      body.data.phone,
      body.data.code,
    );
    return result.ok
      ? NextResponse.json({ verified: true })
      : NextResponse.json(
          { error: REASONS[result.reason] ?? "Verification failed." },
          { status: 400 },
        );
  } catch {
    return NextResponse.json(
      { error: "Could not verify that number right now." },
      { status: 503 },
    );
  }
}
