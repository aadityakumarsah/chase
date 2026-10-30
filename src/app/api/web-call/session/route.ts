import { NextRequest, NextResponse } from "next/server";
import { and, eq, gte, inArray } from "drizzle-orm";
import { z } from "zod";
import { labAuthStatus } from "@/lib/calls/lab-auth";
import { loadCallContext } from "@/lib/calls/context";
import { syncedCollectionsPrompt } from "@/lib/calls/dispatch";
import { getDb } from "@/lib/db";
import { calls, debtors } from "@/lib/db/schema";
import { compileDossier, toCallVariables } from "@/lib/dossier";
import { getBolnaClient } from "@/lib/bolna/client";
import { getEnv } from "@/lib/env";
import { emitEvent } from "@/lib/events";
export const runtime = "nodejs";
export const maxDuration = 30;
const input = z
  .object({ user_data: z.object({ debtor_id: z.uuid() }).strict() })
  .strict();
export async function POST(request: NextRequest) {
  const status = labAuthStatus(request, true);
  if (status !== 200)
    return NextResponse.json(
      { error: "Unauthorized or invalid origin" },
      { status },
    );
  let debtorId: string;
  try {
    const text = await request.text();
    if (Buffer.byteLength(text) > 2048) throw new Error();
    debtorId = input.parse(JSON.parse(text)).user_data.debtor_id;
  } catch {
    return NextResponse.json(
      { error: "Invalid session request" },
      { status: 400 },
    );
  }
  let callId: string | undefined;
  try {
    const env = getEnv();
    // A browser lab must never expose a built-in tool capable of transferring to a phone.
    if (env.ENABLE_TRANSFER)
      throw new Error(
        "Disable transfer and sync agents before using the browser lab",
      );
    const prompt = await syncedCollectionsPrompt();
    await compileDossier(debtorId);
    const prepared = await getDb().transaction(async (tx) => {
      await tx
        .select({ id: debtors.id })
        .from(debtors)
        .where(eq(debtors.id, debtorId))
        .for("update");
      const [active] = await tx
        .select({ id: calls.id })
        .from(calls)
        .where(
          and(
            eq(calls.debtorId, debtorId),
            eq(calls.purpose, "test"),
            gte(calls.createdAt, new Date(Date.now() - 15 * 60_000)),
            inArray(calls.status, [
              "web_session",
              "queued",
              "ringing",
              "in-progress",
            ]),
          ),
        )
        .limit(1);
      if (active)
        throw new Error("A lab session is already active for this debtor");
      const c = await loadCallContext(debtorId, tx);
      const [call] = await tx
        .insert(calls)
        .values({
          businessId: c.business.id,
          debtorId,
          purpose: "test",
          status: "web_session",
          language: c.language,
          bolnaAgentId: env.BOLNA_COLLECTIONS_AGENT_ID,
          promptVersionId: prompt.id,
        })
        .returning();
      const variables = toCallVariables({
        debtor: c.callDebtor,
        dossier: { text: c.dossierText },
        rating: { score: c.ratingScore },
        callToken: call.callToken,
        language: c.language,
        today: c.today,
      });
      return { call, variables };
    });
    callId = prepared.call.id;
    const session = await getBolnaClient().mintWebCallSession({
      agent_id: env.BOLNA_COLLECTIONS_AGENT_ID!,
      user_data: prepared.variables,
    });
    await getDb()
      .update(calls)
      .set({ bolnaExecutionId: session.run_id })
      .where(eq(calls.id, callId));
    await emitEvent("call.web_session", {
      debtorId,
      callId,
      payload: { purpose: "test" },
    });
    return NextResponse.json(session, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    if (callId)
      await getDb()
        .update(calls)
        .set({ status: "failed", terminationReason: "web_session_failed" })
        .where(eq(calls.id, callId));
    return NextResponse.json(
      {
        error:
          "Could not start a lab session. Check agent sync, active sessions and Bolna capacity.",
      },
      { status: 503 },
    );
  }
}
