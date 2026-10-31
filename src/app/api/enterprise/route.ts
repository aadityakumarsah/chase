import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { enterpriseLeads } from "@/lib/db/schema";
import { getEnv } from "@/lib/env";
import { normalisePhone } from "@/lib/phone";
import { publicRateLimit } from "@/lib/public-rate-limit";

const schema = z.object({
  companyName: z.string().trim().min(2).max(200),
  contactName: z.string().trim().min(2).max(200),
  email: z.email().max(320),
  phone: z.string().trim().max(30).optional(),
  seats: z.union([z.string(), z.number()]).optional(),
  message: z.string().trim().max(2000).optional(),
});
export async function POST(request: NextRequest) {
  const limited = publicRateLimit(request, "enterprise-lead", 5);
  if (limited) return limited;
  if (request.headers.get("origin") !== new URL(getEnv().APP_BASE_URL).origin)
    return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
  if (Number(request.headers.get("content-length") ?? 0) > 8192)
    return NextResponse.json({ error: "Request too large" }, { status: 413 });
  let raw: unknown;
  try {
    const text = await request.text();
    if (Buffer.byteLength(text) > 8192)
      return NextResponse.json({ error: "Request too large" }, { status: 413 });
    raw = JSON.parse(text);
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success)
    return NextResponse.json(
      { error: "Check your contact details" },
      { status: 400 },
    );
  const v = parsed.data;
  let phoneE164: string | null = null;
  try {
    if (v.phone) phoneE164 = normalisePhone(v.phone);
  } catch {
    return NextResponse.json(
      { error: "Enter a valid Indian mobile number" },
      { status: 400 },
    );
  }
  const seats = v.seats ? Number(v.seats) : null;
  if (
    seats !== null &&
    (!Number.isInteger(seats) || seats < 1 || seats > 100000)
  )
    return NextResponse.json(
      { error: "Enter a valid seat count" },
      { status: 400 },
    );
  try {
    await getDb()
      .insert(enterpriseLeads)
      .values({
        companyName: v.companyName,
        contactName: v.contactName,
        email: v.email.toLowerCase(),
        phoneE164,
        seats,
        message: v.message || null,
      });
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch {
    return NextResponse.json(
      { error: "Could not save request" },
      { status: 503 },
    );
  }
}
