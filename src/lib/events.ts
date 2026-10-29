import { asc, desc, gt } from "drizzle-orm";
import { z } from "zod";
import { getDb, type DbExecutor } from "@/lib/db";
import { events } from "@/lib/db/schema";
import { redact } from "@/lib/log";
const eventSchema = z.object({
  debtorId: z.uuid().optional(),
  callId: z.uuid().optional(),
  payload: z.record(z.string(), z.json()),
});
export const eventQuerySchema = z.object({
  afterId: z
    .string()
    .regex(/^\d+$/)
    .max(19)
    .refine((v) => BigInt(v) <= 9223372036854775807n)
    .default("0"),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
const serialize = (event: typeof events.$inferSelect) => ({
  id: event.id.toString(),
  type: event.type,
  debtorId: event.debtorId,
  callId: event.callId,
  payload: event.payload,
  at: event.at.toISOString(),
  createdAt: event.createdAt.toISOString(),
});
export async function emitEvent(
  type: string,
  input: z.input<typeof eventSchema>,
  db: DbExecutor = getDb(),
) {
  z.string()
    .regex(/^[a-z][a-z0-9_.]*$/)
    .max(120)
    .parse(type);
  const event = eventSchema.parse(input);
  const payload = z
    .record(z.string(), z.unknown())
    .parse(redact(event.payload));
  const [row] = await db
    .insert(events)
    .values({ ...event, type, payload })
    .returning();
  return serialize(row);
}
export async function listEvents(
  input: { afterId?: string; limit?: number } = {},
  db: DbExecutor = getDb(),
) {
  const query = eventQuerySchema.parse(input);
  return (
    await db
      .select()
      .from(events)
      .where(gt(events.id, BigInt(query.afterId)))
      .orderBy(asc(events.id))
      .limit(query.limit)
  ).map(serialize);
}
export async function recentEvents(limit = 50) {
  z.number().int().min(1).max(100).parse(limit);
  return (
    await getDb().select().from(events).orderBy(desc(events.id)).limit(limit)
  ).map(serialize);
}
// Compatibility for the Part 1 console adapter; IDs are now decimal strings.
export async function appendEvent(input: {
  type: string;
  payload: Record<string, z.infer<ReturnType<typeof z.json>>>;
}) {
  return emitEvent(input.type, { payload: input.payload });
}
