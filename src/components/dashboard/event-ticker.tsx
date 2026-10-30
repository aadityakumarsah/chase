"use client";
import { motion } from "framer-motion";
import type { DashboardEvent } from "@/lib/dashboard/types";
import { sentence } from "@/lib/dashboard/client";
export function EventTicker({ events }: { events: DashboardEvent[] }) {
  const text = events
    .slice(0, 12)
    .map(
      (event) =>
        `${sentence(event.type)}${event.shopName ? ` · ${event.shopName}` : ""}`,
    )
    .join("   •   ");
  return (
    <div className="overflow-hidden border-y bg-card py-2.5 text-xs text-muted-foreground">
      <motion.div
        className="w-max whitespace-nowrap"
        animate={{ x: [0, -600] }}
        transition={{
          repeat: Infinity,
          duration: 26,
          ease: "linear",
          repeatType: "loop",
        }}
      >
        {text || "Live decisions and payments will appear here."}{" "}
        &nbsp;&nbsp;&nbsp; {text}
      </motion.div>
    </div>
  );
}
