"use client";
import { useEffect, useRef, useState } from "react";
import useSWR from "swr";
import { BolnaWebCall, type CallState } from "@bolna/web-call";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
export function WebCallLab({
  debtors,
  initialDebtorId,
}: {
  debtors: { id: string; shop: string; name: string }[];
  initialDebtorId?: string;
}) {
  const [selected, setSelected] = useState(
    debtors.find((d) => d.id === initialDebtorId)?.id ??
      debtors.find((d) => d.shop === "Sharma General Store")?.id ??
      debtors[0]?.id ??
      "",
  );
  const [state, setState] = useState<CallState>("idle");
  const [events, setEvents] = useState<string[]>([]);
  const callRef = useRef<BolnaWebCall | null>(null);
  const { data, error, isLoading } = useSWR(
    selected ? `/api/web-call/context?debtorId=${selected}` : null,
    async (url: string) => {
      const r = await fetch(url);
      if (!r.ok) throw new Error("Preview unavailable");
      return r.json() as Promise<Record<string, string | number>>;
    },
  );
  const active = ["connecting", "ringing", "active"].includes(state);
  useEffect(
    () => () => {
      void callRef.current?.stop();
    },
    [],
  );
  function start() {
    if (active || !selected) return;
    const append = (event: string) =>
      setEvents((old) => [...old.slice(-49), event]);
    const call = new BolnaWebCall({
      sessionUrl: "/api/web-call/session",
      debug: false,
    });
    callRef.current = call;
    call.on("state-change", (value) => {
      setState(value);
      append(value);
    });
    call.on("media-permission", () => append("Microphone ready"));
    call.on("call-start", () => append("Agent answered"));
    call.on("error", (e) => append(`Call error: ${e.code}`));
    call.on("call-end", ({ reason }) => {
      append(`Ended: ${reason}`);
      const run_id = call.getRunId();
      if (run_id)
        void fetch("/api/web-call/end", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ run_id }),
        });
    });
    // Must execute in the click gesture, before awaiting a fetch or loading code.
    void call
      .start({ userData: { debtor_id: selected } })
      .catch(() =>
        append(
          "Unable to connect. Check microphone permission and session setup.",
        ),
      );
  }
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Test call</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <label className="grid gap-2 text-sm font-medium">
            Debtor
            <select
              className="rounded-md border bg-background p-3"
              value={selected}
              onChange={(e) => setSelected(e.target.value)}
              disabled={active}
            >
              {debtors.map((d) => (
                <option value={d.id} key={d.id}>
                  {d.shop} · {d.name}
                </option>
              ))}
            </select>
          </label>
          <div className="flex items-center gap-3">
            <Button
              onClick={start}
              disabled={active || isLoading || !data || !!error}
            >
              Start call
            </Button>
            <Button
              variant="outline"
              disabled={!active}
              onClick={() => void callRef.current?.stop()}
            >
              Stop
            </Button>
            <span role="status" className="text-sm text-muted-foreground">
              {state}
            </span>
          </div>
          <p className="text-sm text-muted-foreground">
            Try confirming your identity, asking “क्या आप robot हो?”, and
            offering a payment date. Tool responses clearly identify simulated
            actions.
          </p>
          <div className="rounded-lg bg-muted p-4 text-sm" aria-live="polite">
            <p className="mb-2 font-medium">Call events</p>
            {events.length ? (
              events.map((e, i) => <p key={i}>{e}</p>)
            ) : (
              <p className="text-muted-foreground">Ready when you are.</p>
            )}
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Account context sent to Chase</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="mb-3 text-sm text-muted-foreground">
            Prepared by the server. The call token is generated privately for
            each session.
          </p>
          {error ? (
            <p role="alert">Could not load account context.</p>
          ) : isLoading ? (
            <p>Loading context…</p>
          ) : (
            <pre className="max-h-[36rem] overflow-auto rounded-lg bg-muted p-4 text-xs whitespace-pre-wrap break-words">
              {JSON.stringify(data, null, 2)}
            </pre>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
