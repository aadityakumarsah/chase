"use client";
import { AnimatePresence, motion } from "framer-motion";
import {
  Circle,
  ExternalLink,
  Link2,
  MessageCircle,
  PhoneCall,
  ReceiptIndianRupee,
  ShieldAlert,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { RelativeTime } from "@/components/relative-time";
import type { DashboardEvent, LiveCall } from "@/lib/dashboard/types";
import { inr, sentence } from "@/lib/dashboard/client";

const stages = ["queued", "ringing", "in progress", "completed"];
const stageIndex = (status: string) => {
  if (["completed", "stopped", "no-answer", "failed", "busy"].includes(status))
    return 3;
  if (["in-progress", "in_progress", "call-disconnected"].includes(status))
    return 2;
  if (["ringing", "initiated"].includes(status)) return 1;
  return 0;
};
const eventIcon = (type: string) => {
  if (type.includes("payment.received")) return ReceiptIndianRupee;
  if (type.includes("link")) return Link2;
  if (type.includes("message")) return MessageCircle;
  if (type.includes("gate") || type.includes("supervisor")) return ShieldAlert;
  return Circle;
};
const eventDetail = (event: DashboardEvent) => {
  const payload = event.payload;
  if (typeof payload.amountPaise === "string")
    return `${inr(payload.amountPaise)}${payload.simulated === true ? " · simulated" : ""}`;
  if (typeof payload.scheduled === "string")
    return `Moved to ${new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" }).format(new Date(payload.scheduled))}`;
  if (Array.isArray(payload.rules)) return payload.rules.join(", ");
  if (typeof payload.channel === "string")
    return `${sentence(payload.channel)}${payload.simulated === true ? " · demo console" : ""}`;
  if (
    payload.args &&
    typeof payload.args === "object" &&
    !Array.isArray(payload.args)
  ) {
    const args = Object.entries(payload.args as Record<string, unknown>)
      .filter(([key]) => key !== "account_id")
      .slice(0, 3)
      .map(([key, value]) => `${sentence(key)}: ${String(value)}`);
    if (args.length) return args.join(" · ");
  }
  if (typeof payload.ok === "boolean")
    return payload.ok ? "Completed" : "Rejected safely";
  return null;
};
const eventForStage = (events: DashboardEvent[], index: number) => {
  const patterns = [
    /call\.(queued|scheduled)/,
    /call\.(ringing|initiated)/,
    /call\.(in_progress|call_disconnected)/,
    /call\.(completed|stopped|no_answer|failed|busy)/,
  ];
  return events.find((event) => patterns[index]!.test(event.type));
};
export function LiveCallPanel({
  call,
  stage = false,
}: {
  call: LiveCall | null;
  stage?: boolean;
}) {
  if (!call)
    return (
      <div className="grid min-h-64 place-items-center rounded-lg bg-muted/30 p-8 text-center">
        <div>
          <PhoneCall className="mx-auto mb-3 text-muted-foreground" />
          <p className={stage ? "text-[24px] font-medium" : "font-medium"}>
            Ready for the next conversation
          </p>
          <p
            className={
              stage
                ? "mt-1 text-[20px] text-muted-foreground"
                : "mt-1 text-sm text-muted-foreground"
            }
          >
            The next queued call will appear here live.
          </p>
        </div>
      </div>
    );
  const current = stageIndex(call.status);
  const transcript = (call.transcript ?? "").split("\n").filter(Boolean);
  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p
            className={
              stage ? "text-2xl font-semibold" : "text-base font-semibold"
            }
          >
            {call.shopName}
          </p>
          <p
            className={
              stage
                ? "mt-1 text-[20px] text-muted-foreground"
                : "mt-1 text-sm text-muted-foreground"
            }
          >
            {call.contactName}
          </p>
        </div>
        <Badge
          className={
            stage
              ? "gap-2 bg-sky-500/15 px-3 py-1.5 text-[20px] text-sky-500"
              : "gap-2 bg-sky-500/15 text-sky-500"
          }
        >
          <span className="size-2 animate-pulse rounded-full bg-sky-500" />
          {sentence(call.status)}
        </Badge>
      </div>
      <div className="grid grid-cols-4 gap-2">
        {stages.map((label, index) => {
          const event = eventForStage(call.events, index);
          const timestamp =
            event?.at ??
            (index === 3
              ? call.endedAt
              : index === 2
                ? call.startedAt
                : index === 0
                  ? call.events[0]?.at
                  : null);
          return (
            <div key={label} className="relative">
              <div
                className={`h-1 rounded-full ${index <= current ? "bg-primary" : "bg-muted"}`}
              />
              <p
                className={`mt-2 uppercase tracking-wide ${stage ? "text-[20px]" : "text-[10px]"} ${index <= current ? "text-foreground" : "text-muted-foreground"}`}
              >
                {label}
              </p>
              {timestamp && (
                <RelativeTime
                  value={timestamp}
                  className={
                    stage
                      ? "text-[20px] text-muted-foreground"
                      : "text-[10px] text-muted-foreground"
                  }
                />
              )}
            </div>
          );
        })}
      </div>
      <div
        className={
          stage
            ? "max-h-[420px] space-y-3 overflow-auto pr-2"
            : "max-h-64 space-y-3 overflow-auto pr-2"
        }
      >
        <AnimatePresence initial={false}>
          {call.events.slice(-12).map((event) => {
            const Icon = eventIcon(event.type);
            const money = event.type === "payment.received";
            const blocked = event.type.includes("gate.blocked");
            return (
              <motion.div
                key={event.id}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                className={`flex gap-3 rounded-lg border p-3 ${money ? "border-emerald-500/30 bg-emerald-500/8" : blocked ? "border-rose-500/30 bg-rose-500/8" : "bg-muted/25"}`}
              >
                <Icon
                  size={16}
                  className={
                    money
                      ? "text-emerald-500"
                      : blocked
                        ? "text-rose-500"
                        : "text-primary"
                  }
                />
                <div className="min-w-0 flex-1">
                  <p
                    className={
                      stage
                        ? "truncate text-[20px] font-medium"
                        : "truncate text-xs font-medium"
                    }
                  >
                    {sentence(event.type)}
                  </p>
                  {eventDetail(event) && (
                    <p
                      className={
                        stage
                          ? "mt-1 truncate text-[20px] text-muted-foreground"
                          : "mt-1 truncate text-[11px] text-muted-foreground"
                      }
                    >
                      {eventDetail(event)}
                    </p>
                  )}
                  <RelativeTime
                    value={event.at}
                    className={
                      stage
                        ? "text-[20px] text-muted-foreground"
                        : "text-[10px] text-muted-foreground"
                    }
                  />
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
      {transcript.length > 0 && (
        <div className="space-y-2 rounded-lg bg-muted/40 p-4">
          <p
            className={
              stage
                ? "text-[20px] font-semibold tracking-wider text-muted-foreground uppercase"
                : "text-[10px] font-semibold tracking-wider text-muted-foreground uppercase"
            }
          >
            Latest transcript
          </p>
          {transcript.slice(stage ? -2 : -5).map((line, index) => {
            const [speaker, ...rest] = line.split(":");
            return (
              <p
                key={`${index}-${line}`}
                className={`${stage ? "text-[20px] leading-8" : "text-sm leading-6"} ${speaker?.toLowerCase() === "user" ? "font-devanagari text-foreground" : "text-muted-foreground"}`}
              >
                <span
                  className={
                    stage
                      ? "mr-2 text-[20px] font-semibold uppercase"
                      : "mr-2 text-[10px] font-semibold uppercase"
                  }
                >
                  {speaker}
                </span>
                {rest.join(":").trim()}
              </p>
            );
          })}
        </div>
      )}
      {call.recordingUrl && (
        <audio controls className="h-9 w-full" src={call.recordingUrl} />
      )}
      {call.ownerSummary && (
        <div className="rounded-lg border border-primary/20 bg-primary/5 p-4">
          <p
            className={
              stage
                ? "text-[20px] font-semibold tracking-wider text-primary uppercase"
                : "text-[10px] font-semibold tracking-wider text-primary uppercase"
            }
          >
            Owner summary
          </p>
          <p
            className={
              stage ? "mt-2 text-[20px] leading-8" : "mt-2 text-sm leading-6"
            }
          >
            {call.ownerSummary}
          </p>
        </div>
      )}
      {!stage && (
        <a
          href={`/calls/${call.id}`}
          className="inline-flex items-center gap-1 text-xs font-medium text-primary"
        >
          Open call record <ExternalLink size={12} />
        </a>
      )}
    </div>
  );
}

export function PhoneMockup({ call }: { call: LiveCall | null }) {
  return (
    <div className="mx-auto w-full rounded-xl border bg-muted/20 p-3 text-foreground">
      <div className="rounded-lg border-b px-3 py-3 text-xs font-medium">
        {call?.shopName ?? "WhatsApp preview"}
      </div>
      <div className="mt-3 h-56 space-y-2 overflow-auto">
        {call?.messages.length ? (
          call.messages.slice(-6).map((message) => (
            <div
              key={message.id}
              className={`max-w-[88%] rounded-lg border px-3 py-2 text-xs leading-5 ${message.direction === "out" ? "ml-auto bg-muted" : "bg-card"}`}
            >
              <p className="whitespace-pre-wrap break-words">{message.body}</p>
              <p className="mt-1 text-right text-[10px] text-muted-foreground">
                {message.provider === "console"
                  ? "Demo console"
                  : message.status}
              </p>
            </div>
          ))
        ) : (
          <p className="pt-20 text-center text-xs text-muted-foreground">
            Payment links and messages appear here.
          </p>
        )}
      </div>
    </div>
  );
}
