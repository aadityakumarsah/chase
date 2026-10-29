"use client";
import useSWR from "swr";
import { healthSchema } from "@/lib/health";
import { Badge } from "@/components/ui/badge";
export function LiveStatus() {
  const { data, error } = useSWR(
    "/api/health",
    async (url: string) => {
      const response = await fetch(url);
      if (!response.ok) throw new Error("Health check unavailable");
      return healthSchema.parse(await response.json());
    },
    { refreshInterval: 15_000 },
  );
  return (
    <Badge
      variant="outline"
      className="gap-2 border-stone-200 bg-white px-3 py-1.5 font-normal"
    >
      <span
        className={`size-1.5 rounded-full ${error ? "bg-amber-500" : data ? "bg-emerald-500" : "bg-stone-400"}`}
      />
      {error
        ? "Service needs attention"
        : data
          ? "Workspace online"
          : "Connecting…"}
    </Badge>
  );
}
