import { desc } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { events } from "@/lib/db/schema";
import { redact } from "@/lib/log";
const eventSchema = z.object({
  type: z.string().min(1).max(120),
  entityId: z.string().max(128).optional(),
  payload: z.record(z.string(), z.json()),
});
export async function appendEvent(input: z.input<typeof eventSchema>) {
  const event = eventSchema.parse(input);
  const payload = z
    .record(z.string(), z.unknown())
    .parse(redact(event.payload));
  return (
    await getDb()
      .insert(events)
      .values({ ...event, payload })
      .returning()
  )[0];
}
export async function recentEvents(limit = 50) {
  z.number().int().min(1).max(100).parse(limit);
  return getDb()
    .select()
    .from(events)
    .orderBy(desc(events.createdAt))
    .limit(limit);
}
