"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import useSWR from "swr";
import { motion, MotionConfig } from "framer-motion";
import {
  ArrowLeft,
  ArrowUpRight,
  AudioLines,
  Check,
  ChevronRight,
  Expand,
  FileText,
  Keyboard,
  MessageCircle,
  Minimize,
  Phone,
  RotateCcw,
  ShieldCheck,
  TrendingUp,
  Wallet,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { apiFetch, inr, sentence } from "@/lib/dashboard/client";
import type {
  DashboardSummary,
  LiveCall,
  QueueItem,
} from "@/lib/dashboard/types";
import { RelativeTime } from "@/components/relative-time";
import { ChaseBrand } from "@/components/marketing/brand";
import { useReadOnly } from "@/components/read-only-context";
import styles from "./stage.module.css";

const terminal = new Set([
  "completed",
  "call-disconnected",
  "stopped",
  "no-answer",
  "busy",
  "failed",
  "canceled",
  "cancelled",
  "error",
  "balance-low",
]);

export function StageView() {
  const readOnly = useReadOnly();
  const summary = useSWR<DashboardSummary>("/api/dashboard/summary", apiFetch, {
    refreshInterval: 1500,
  });
  const queue = useSWR<{ items: QueueItem[] }>("/api/queue", apiFetch, {
    refreshInterval: 1500,
  });
  const [legend, setLegend] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  const busy = useRef(false);

  const toggleFullscreen = useCallback(async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch {
      toast.info(
        "Fullscreen isn’t available in this browser. Stage already uses the full workspace.",
      );
    }
  }, []);
  useEffect(() => {
    const changed = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", changed);
    return () => document.removeEventListener("fullscreenchange", changed);
  }, []);

  const runAction = useCallback(
    async (key: string) => {
      if (readOnly) return void toast.info("This demo is read-only");
      if (busy.current) return;
      let url: string;
      let body: string | undefined;
      let message: string;
      if (key === "1") {
        const debtor = queue.data?.items.find((item) => item.demoDebtor);
        if (!debtor)
          return void toast.error(
            "Configure the demo recipient before calling",
          );
        url = "/api/calls/start";
        body = JSON.stringify({ debtorId: debtor.debtorId });
        message = "Demo call queued";
      } else if (key === "2") {
        const token = summary.data?.liveCall?.paymentToken;
        if (!token)
          return void toast.error("No active payment link to simulate");
        url = `/api/pay/${token}/simulate`;
        message = "Simulated payment recorded";
      } else if (key === "3") {
        url = "/api/brief/run";
        body = JSON.stringify({
          date: "today",
          deliver: ["dashboard", "call"],
        });
        message = "Owner brief call queued";
      } else if (key === "r") {
        if (!window.confirm("Reset the fictional demo portfolio?")) return;
        url = "/api/demo/reset";
        message = "Demo portfolio restored";
      } else return;
      busy.current = true;
      setPending(key);
      try {
        const response = await fetch(url, {
          method: "POST",
          ...(body
            ? { headers: { "Content-Type": "application/json" }, body }
            : {}),
        });
        const result = (await response.json().catch(() => null)) as {
          status?: string;
        } | null;
        if (!response.ok || result?.status === "blocked")
          throw new Error("unavailable");
        toast.success(message);
        void summary.mutate();
        void queue.mutate();
      } catch {
        toast.error(
          "Action unavailable. Check the workspace for configuration and contact rules.",
        );
      } finally {
        busy.current = false;
        setPending(null);
      }
    },
    [readOnly, queue, summary],
  );

  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (
        event.repeat ||
        event.metaKey ||
        event.ctrlKey ||
        event.altKey ||
        (event.target instanceof HTMLElement &&
          event.target.closest(
            "input,textarea,select,button,a,[contenteditable=true]",
          ))
      )
        return;
      const key = event.key.toLowerCase();
      if (key === "f") {
        event.preventDefault();
        void toggleFullscreen();
      }
      if (["1", "2", "3", "r"].includes(key)) {
        event.preventDefault();
        void runAction(key);
      }
      if (key === "escape") setLegend(false);
      if (key === "?") setLegend((value) => !value);
    };
    window.addEventListener("keydown", keydown);
    return () => window.removeEventListener("keydown", keydown);
  }, [runAction, toggleFullscreen]);

  if (!summary.data || !queue.data)
    return (
      <main className={styles.stage}>
        <div className={styles.loading}>
          <ChaseBrand />
          <h1>
            {summary.error || queue.error
              ? "Stage couldn’t connect."
              : "Getting the room ready."}
          </h1>
          <p>
            {summary.error || queue.error
              ? "Check your connection, then try again."
              : "Bringing your conversations and accounts into view."}
          </p>
          <button
            onClick={() => {
              void summary.mutate();
              void queue.mutate();
            }}
          >
            Reconnect <RotateCcw size={15} />
          </button>
          <Link href="/dashboard">Back to workspace</Link>
        </div>
      </main>
    );
  const data = summary.data;
  const live =
    data.liveCall &&
    !data.liveCall.endedAt &&
    !terminal.has(data.liveCall.status);
  const gateSlot = data.latestGateBlock
    ? String(
        data.latestGateBlock.detail.scheduled ??
          data.latestGateBlock.detail.nextAllowedAt ??
          "",
      )
    : "";
  const movedTo =
    gateSlot && Number.isFinite(Date.parse(gateSlot))
      ? new Intl.DateTimeFormat("en-IN", {
          timeZone: "Asia/Kolkata",
          day: "numeric",
          month: "short",
          hour: "numeric",
          minute: "2-digit",
        }).format(new Date(gateSlot))
      : null;
  const reconnecting = summary.error || queue.error;

  return (
    <MotionConfig reducedMotion="user">
      <main className={styles.stage}>
        <header className={styles.header}>
          <div className={styles.identity}>
            <ChaseBrand href="/dashboard" />
            <span className={styles.headerDivider} />
            <div>
              <span>COLLECTIONS, IN FOCUS</span>
              <strong>{data.business.name}</strong>
            </div>
          </div>
          <div className={styles.headerActions}>
            <span className={styles.connection}>
              <i className={reconnecting ? styles.offlineDot : ""} />
              {reconnecting ? "Reconnecting" : "Connected"}
            </span>
            {data.meta.demoMode && (
              <span className={styles.mode}>Demo workspace</span>
            )}
            <Link href="/dashboard" className={styles.workspaceLink}>
              <ArrowLeft size={14} />
              Workspace
            </Link>
            <button
              onClick={() => void toggleFullscreen()}
              aria-label={fullscreen ? "Exit fullscreen" : "Enter fullscreen"}
              title="Fullscreen (F)"
            >
              {fullscreen ? <Minimize size={17} /> : <Expand size={17} />}
            </button>
          </div>
        </header>
        <div className={styles.intro}>
          <div>
            <span className={styles.eyebrow}>
              EVERY CONVERSATION. A STEP FORWARD.
            </span>
            <h1>
              The follow-up, <span>in focus.</span>
            </h1>
          </div>
          <p>
            Bolna makes the call.
            <br />
            <strong>Chase gets you paid.</strong>
          </p>
        </div>
        {data.business.demoOverride && (
          <p className={styles.notice}>
            <ShieldCheck size={14} /> Demo calling-window override is enabled
            for allowlisted recipients.
          </p>
        )}
        <div className={styles.workspace}>
          <section className={styles.conversationPanel}>
            <div className={styles.panelHeading}>
              <span>
                <AudioLines size={15} />
                {live
                  ? "LIVE CONVERSATION"
                  : data.liveCall
                    ? "LATEST CONVERSATION"
                    : "CONVERSATION"}
              </span>
              <span className={styles.purpose}>
                {readOnly ? "READ-ONLY VIEW" : "VOICE · BOLNA"}
              </span>
            </div>
            <StageConversation call={data.liveCall} live={Boolean(live)} />
          </section>
          <section className={styles.queuePanel}>
            <div className={styles.panelHeading}>
              <span>
                <TrendingUp size={15} />
                UP NEXT
              </span>
              <Link href="/debtors">
                All accounts <ArrowUpRight size={13} />
              </Link>
            </div>
            <div className={styles.queueIntro}>
              <h2>
                A reason behind
                <br />
                <span>every next call.</span>
              </h2>
              <span>
                {queue.data.items.filter((item) => item.allowed).length}{" "}
                eligible now
              </span>
            </div>
            <StageQueue items={queue.data.items.slice(0, 5)} />
            <div className={styles.queueFooter}>
              <ShieldCheck size={14} />
              Contact rules are checked again before dialing.
            </div>
          </section>
        </div>
        <section
          className={styles.metrics}
          aria-label="Today’s collection outcomes"
        >
          <div>
            <span>
              <Wallet size={15} />
              COLLECTED TODAY
            </span>
            <strong>{inr(data.kpis.collectedTodayPaise)}</strong>
            <small>
              {Number(data.kpis.simulatedCollectedTodayPaise) > 0
                ? `Includes ${inr(data.kpis.simulatedCollectedTodayPaise)} simulated`
                : "Confirmed receipts"}
            </small>
          </div>
          <div>
            <span>
              <Check size={15} />
              PROMISED TODAY
            </span>
            <strong>{inr(data.kpis.promisedTodayPaise)}</strong>
            <small>Recorded commitments</small>
          </div>
          <div>
            <span>
              <Phone size={15} />
              CONVERSATIONS
            </span>
            <strong>
              {data.kpis.callsConnected}
              <em> / {data.kpis.callsAttempted}</em>
            </strong>
            <small>{data.kpis.connectRate}% connect rate today</small>
          </div>
          <div className={styles.gateMetric}>
            <span>
              <ShieldCheck size={15} />
              CONDUCT BY CONSTRUCTION
            </span>
            <strong>
              {data.latestGateBlock
                ? sentence(data.latestGateBlock.rule)
                : "Guardrails on."}
            </strong>
            <small>
              {data.latestGateBlock
                ? movedTo
                  ? `Moved to ${movedTo} IST`
                  : (data.latestGateBlock.shopName ?? "Decision recorded")
                : `${data.kpis.blocked} blocked · ${data.kpis.optOuts} opt-outs honoured`}
            </small>
          </div>
        </section>
        <footer className={styles.footer}>
          <a href="https://sagarmathalabs.com" target="_blank" rel="noreferrer">
            Backed by <strong>Sagarmatha Labs</strong>
            <ArrowUpRight size={12} />
          </a>
          <span>LIVE DATA · ASIA / KOLKATA</span>
          <button
            aria-expanded={legend}
            aria-controls="stage-controls"
            onClick={() => setLegend(!legend)}
          >
            <Keyboard size={16} />
            {legend ? "Hide controls" : "Stage controls"}
          </button>
        </footer>
        {legend && (
          <div
            id="stage-controls"
            className={styles.controls}
            role="region"
            aria-label="Stage controls"
          >
            <div>
              <span>STAGE CONTROLS</span>
              <button
                onClick={() => setLegend(false)}
                aria-label="Close stage controls"
              >
                <X size={17} />
              </button>
            </div>
            <p>
              {readOnly
                ? "This workspace is read-only."
                : "Calling actions use your configured recipients and contact safeguards."}
            </p>
            {!readOnly && (
              <div className={styles.controlGrid}>
                {[
                  { key: "1", label: "Call demo recipient", icon: Phone },
                  { key: "2", label: "Simulate payment", icon: Wallet },
                  { key: "3", label: "Call owner with brief", icon: FileText },
                  { key: "r", label: "Reset demo portfolio", icon: RotateCcw },
                ].map((action) => (
                  <button
                    key={action.key}
                    disabled={pending !== null}
                    onClick={() => void runAction(action.key)}
                  >
                    <action.icon size={15} />
                    <span>
                      {pending === action.key ? "Working…" : action.label}
                    </span>
                    <kbd>{action.key.toUpperCase()}</kbd>
                  </button>
                ))}
              </div>
            )}
            <button
              className={styles.fullscreenControl}
              onClick={() => void toggleFullscreen()}
            >
              <Expand size={15} />
              {fullscreen ? "Exit fullscreen" : "Fullscreen"}
              <kbd>F</kbd>
            </button>
          </div>
        )}
      </main>
    </MotionConfig>
  );
}

function StageConversation({
  call,
  live,
}: {
  call: LiveCall | null;
  live: boolean;
}) {
  const [tab, setTab] = useState<"conversation" | "messages">("conversation");
  const transcript = (call?.transcript ?? "")
    .split("\n")
    .filter(Boolean)
    .slice(-3);
  return (
    <div className={styles.callContent}>
      <div className={styles.callIdentity}>
        <div>
          <span className={styles.eyebrow}>
            {call ? call.contactName : "READY WHEN YOU ARE"}
          </span>
          <h2>{call?.shopName ?? "A conversation can change everything."}</h2>
        </div>
        <span className={styles.callStatus}>
          {live && <i />}
          {call ? sentence(call.status) : "Standby"}
        </span>
      </div>
      <div className={`${styles.voiceVisual} ${live ? styles.speaking : ""}`}>
        <div className={styles.voiceLine} aria-hidden="true">
          {Array.from({ length: 27 }, (_, i) => (
            <i
              key={i}
              style={{
                height: `${12 + ((i * 23 + 7) % 57)}px`,
                animationDelay: `${i * -0.08}s`,
              }}
            />
          ))}
        </div>
        <Image
          src="/assets/chase-mascot.webp"
          width={155}
          height={142}
          alt="Chase voice assistant"
        />
        <div className={styles.voiceLine} aria-hidden="true">
          {Array.from({ length: 27 }, (_, i) => (
            <i
              key={i}
              style={{
                height: `${12 + ((i * 19 + 13) % 57)}px`,
                animationDelay: `${i * -0.07}s`,
              }}
            />
          ))}
        </div>
      </div>
      <div
        className={styles.callTabs}
        role="group"
        aria-label="Conversation view"
      >
        <button
          aria-pressed={tab === "conversation"}
          onClick={() => setTab("conversation")}
        >
          <AudioLines size={14} />
          Conversation
        </button>
        <button
          aria-pressed={tab === "messages"}
          onClick={() => setTab("messages")}
        >
          <MessageCircle size={14} />
          Messages{" "}
          {call?.messages.length ? <span>{call.messages.length}</span> : null}
        </button>
        {call?.startedAt && (
          <RelativeTime value={call.startedAt} className={styles.callTime} />
        )}
      </div>
      <div className={styles.transcript}>
        {tab === "conversation" ? (
          transcript.length ? (
            transcript.map((line, i) => {
              const split = line.indexOf(":");
              const speaker =
                split > 0 && split < 20 ? line.slice(0, split) : null;
              return (
                <div key={`${i}-${line}`} className={styles.transcriptLine}>
                  <span>{speaker ? sentence(speaker) : "Transcript"}</span>
                  <p>{speaker ? line.slice(split + 1).trim() : line}</p>
                </div>
              );
            })
          ) : (
            <div className={styles.emptyConversation}>
              <span>
                {live
                  ? "The conversation is in progress."
                  : "Thoughtful conversations start here."}
              </span>
              <p>
                {live
                  ? "The completed transcript will appear when it becomes available."
                  : "The next call’s context, messages and outcome will appear here. Your queue is ready on the right."}
              </p>
            </div>
          )
        ) : call?.messages.length ? (
          call.messages.slice(-3).map((message) => (
            <div key={message.id} className={styles.transcriptLine}>
              <span>
                {message.provider === "console"
                  ? "Demo console · simulated"
                  : sentence(message.channel)}
              </span>
              <p>{message.body}</p>
            </div>
          ))
        ) : (
          <div className={styles.emptyConversation}>
            <span>No messages for this conversation.</span>
            <p>
              Payment links and follow-ups sent during the call will appear
              here. Console delivery is always labelled as simulated.
            </p>
          </div>
        )}
      </div>
      <div className={styles.callFooter}>
        <span>
          <ShieldCheck size={14} />
          {call
            ? "Every decision has an audit trail."
            : "Identity first. Conversation second."}
        </span>
        {call && (
          <Link href={`/calls/${call.id}`}>
            View call record <ArrowUpRight size={14} />
          </Link>
        )}
      </div>
    </div>
  );
}

function StageQueue({ items }: { items: QueueItem[] }) {
  return (
    <div className={styles.queue}>
      {items.length ? (
        items.map((item) => (
          <motion.div
            layout
            key={item.debtorId}
            transition={{ duration: 0.25 }}
            className={styles.queueRow}
          >
            <span className={styles.rank}>
              {String(item.rank).padStart(2, "0")}
            </span>
            <div>
              <Link href={`/debtors/${item.debtorId}`}>
                {item.shopName}
                <ChevronRight size={12} />
              </Link>
              <p>
                {inr(item.outstandingPaise)}
                <span>·</span>
                {item.allowed ? "Ready to call" : "On hold"}
              </p>
              {item.scoreDelta !== 0 && <small>{item.rationale}</small>}
            </div>
            <div className={styles.score}>
              <strong>{item.score ?? "—"}</strong>
              <span>RATING</span>
              {item.scoreDelta !== 0 && (
                <small>
                  {item.scoreDelta > 0 ? "+" : ""}
                  {item.scoreDelta}
                </small>
              )}
            </div>
          </motion.div>
        ))
      ) : (
        <div className={styles.emptyConversation}>
          <span>The queue is clear.</span>
          <p>Imported accounts will appear here in priority order.</p>
        </div>
      )}
    </div>
  );
}
