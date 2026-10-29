import { NextResponse } from "next/server";
import { getEnv } from "@/lib/env";
import { pingDb } from "@/lib/db";
import { healthSchema, type Health } from "@/lib/health";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    const env = getEnv();
    let db: Health["db"] = "missing";
    if (env.DATABASE_URL) {
      try {
        await pingDb();
        db = "reachable";
      } catch {
        db = "unreachable";
      }
    }
    // Public health checks never incur paid calls or expose account details.
    const response = healthSchema.parse({
      ok: db !== "unreachable",
      db,
      bolna: env.BOLNA_API_KEY ? "configured" : "missing",
      llm: { provider: env.LLM_PROVIDER, model: env.LLM_MODEL_FAST },
      messaging: env.MESSAGING_PROVIDER,
      payments: env.PAYMENTS_PROVIDER,
      demoMode: env.DEMO_MODE,
    });
    return NextResponse.json(response, {
      status: response.ok ? 200 : 503,
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid server configuration" },
      { status: 503 },
    );
  }
}
