"use client";
import useSWR from "swr";
import { z } from "zod";
import { Radio } from "lucide-react";
import { formatIST } from "@/lib/time";
const feedSchema = z.object({
  status: z.enum(["database_missing", "ready"]),
  events: z.array(
    z.object({
      id: z.uuid(),
      type: z.string(),
      createdAt: z.iso.datetime({ offset: true }),
      payload: z.record(z.string(), z.unknown()),
    }),
  ),
});
export function EventFeed() {
  const { data, error } = useSWR(
    "/api/events",
    async (url: string) => {
      const response = await fetch(url);
      if (!response.ok) throw new Error("Feed unavailable");
      return feedSchema.parse(await response.json());
    },
    { refreshInterval: 5_000 },
  );
  if (error)
    return (
      <p className="p-8 text-sm text-amber-800">
        The activity feed is unavailable. Check the database connection and
        migrations.
      </p>
    );
  if (!data)
    return (
      <p className="p-8 text-sm text-muted-foreground">Loading activity…</p>
    );
  if (!data.events.length)
    return (
      <div className="flex flex-col items-center px-6 py-14 text-center">
        <div className="mb-4 flex size-11 items-center justify-center rounded-full bg-stone-100">
          <Radio size={20} className="text-stone-400" />
        </div>
        <p className="text-sm font-medium">A fresh start.</p>
        <p className="mt-2 max-w-xs text-sm leading-6 text-muted-foreground">
          {data.status === "database_missing"
            ? "Connect your database to start recording calls, messages and collection activity."
            : "Calls, messages and collection decisions will appear here as they happen."}
        </p>
      </div>
    );
  return (
    <ul className="divide-y">
      {data.events.map((event) => (
        <li key={event.id} className="px-6 py-4">
          <div className="flex justify-between gap-4">
            <span className="text-sm font-medium">{event.type}</span>
            <time className="text-xs text-muted-foreground">
              {formatIST(new Date(event.createdAt))} IST
            </time>
          </div>
          {event.type === "message.simulated" && (
            <p className="mt-2 text-sm text-muted-foreground">
              Demo message ·{" "}
              {typeof event.payload.text === "string"
                ? event.payload.text
                : "Message recorded"}
            </p>
          )}
        </li>
      ))}
    </ul>
  );
}
