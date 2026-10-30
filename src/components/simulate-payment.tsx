"use client";
import { useState } from "react";
export function SimulatePayment({
  token,
  paid,
}: {
  token: string;
  paid: boolean;
}) {
  const [done, setDone] = useState(paid),
    [busy, setBusy] = useState(false);
  return (
    <button
      disabled={busy || done}
      className="rounded-xl border border-amber-500 bg-amber-50 px-5 py-3 font-medium text-amber-950 disabled:opacity-60"
      onClick={async () => {
        setBusy(true);
        const r = await fetch(`/api/pay/${token}/simulate`, { method: "POST" });
        setDone(r.ok);
        setBusy(false);
      }}
    >
      {done ? "Demo payment recorded" : "Simulate successful payment (demo)"}
    </button>
  );
}
