import { NextRequest, NextResponse } from "next/server";
import { getEnv } from "@/lib/env";
import { recentEvents, listEvents, eventQuerySchema } from "@/lib/events";
export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) {
  const parsed = eventQuerySchema.safeParse(
    Object.fromEntries(request.nextUrl.searchParams),
  );
  if (!parsed.success)
    return NextResponse.json(
      { error: "Invalid event cursor or limit" },
      { status: 400 },
    );
  if (!getEnv().DATABASE_URL)
    return NextResponse.json({
      events: [],
      status: "database_missing",
      nextCursor: "0",
    });
  try {
    const rows = request.nextUrl.searchParams.has("afterId")
      ? await listEvents(parsed.data)
      : await recentEvents(parsed.data.limit);
    const nextCursor = rows.reduce(
      (cursor, row) => (BigInt(row.id) > BigInt(cursor) ? row.id : cursor),
      parsed.data.afterId,
    );
    return NextResponse.json(
      { events: rows, status: "ready", nextCursor },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return NextResponse.json(
      { error: "Event feed unavailable; check database migrations" },
      { status: 503 },
    );
  }
}
