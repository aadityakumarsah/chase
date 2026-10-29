import { NextResponse } from "next/server";
import { getEnv } from "@/lib/env";
import { recentEvents } from "@/lib/events";
export const dynamic = "force-dynamic";
export async function GET() {
  if (!getEnv().DATABASE_URL)
    return NextResponse.json({ events: [], status: "database_missing" });
  try {
    return NextResponse.json(
      { events: await recentEvents(), status: "ready" },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return NextResponse.json(
      { error: "Event feed unavailable; run database migrations" },
      { status: 503 },
    );
  }
}
