"use client";

import { useState, type FormEvent } from "react";
import useSWR from "swr";
import { BadgeCheck, Loader2, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { apiFetch } from "@/lib/dashboard/client";
import { useReadOnly } from "@/components/read-only-context";

type Workspace = {
  id: string;
  name: string;
  plan: string;
  ownerName: string;
  ownerPhone: string;
  ownerPhoneVerified: boolean;
  city: string;
  defaultLanguage: "hi" | "en" | "mr";
  upiVpa: string | null;
  merchantName: string | null;
  callWindowStart: string;
  callWindowEnd: string;
  maxAttemptsPerDay: number;
  maxAttemptsPerWeek: number;
  minGapHours: number;
};

const Field = ({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) => (
  <label className="block space-y-2">
    <span className="text-xs text-muted-foreground">{label}</span>
    {children}
    {hint && (
      <span className="block text-[11px] text-muted-foreground">{hint}</span>
    )}
  </label>
);

/**
 * Per-workspace configuration. In the single-tenant build these values lived in
 * environment variables, which is precisely why only one business could use it.
 */
export function WorkspaceSettings() {
  const readOnly = useReadOnly();
  const { data, mutate } = useSWR<{ workspace: Workspace; role: string }>(
    "/api/workspace",
    apiFetch,
  );
  const [saving, setSaving] = useState(false);
  const [otpSent, setOtpSent] = useState(false);
  const [code, setCode] = useState("");
  const [verifying, setVerifying] = useState(false);

  if (!data)
    return (
      <Card>
        <CardHeader>
          <CardTitle>Workspace</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-2/3" />
        </CardContent>
      </Card>
    );

  const ws = data.workspace;
  const canEdit = !readOnly && (data.role === "owner" || data.role === "admin");

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const phone = String(form.get("ownerPhone") ?? "").replace(/[\s-]/g, "");
    setSaving(true);
    const response = await fetch("/api/workspace", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: form.get("name"),
        ownerName: form.get("ownerName"),
        ownerPhone: phone.startsWith("+")
          ? phone
          : `+91${phone.replace(/^0+/, "")}`,
        city: form.get("city"),
        upiVpa: String(form.get("upiVpa") ?? "").trim() || null,
        merchantName: String(form.get("merchantName") ?? "").trim() || null,
        callWindowStart: form.get("callWindowStart"),
        callWindowEnd: form.get("callWindowEnd"),
        maxAttemptsPerDay: form.get("maxAttemptsPerDay"),
        maxAttemptsPerWeek: form.get("maxAttemptsPerWeek"),
        minGapHours: form.get("minGapHours"),
      }),
    });
    setSaving(false);
    const body = await response.json().catch(() => ({}));
    if (!response.ok) return toast.error(body.error ?? "Could not save.");
    toast.success("Workspace updated");
    await mutate();
  }

  async function sendCode() {
    const response = await fetch("/api/workspace/verify-phone", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "send", phone: ws.ownerPhone }),
    });
    if (!response.ok) return toast.error("Could not send the code.");
    setOtpSent(true);
    toast.success(`Code sent to ${ws.ownerPhone}`);
  }

  async function confirmCode() {
    setVerifying(true);
    const response = await fetch("/api/workspace/verify-phone", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "confirm",
        phone: ws.ownerPhone,
        code,
      }),
    });
    setVerifying(false);
    const body = await response.json().catch(() => ({}));
    if (!response.ok) return toast.error(body.error ?? "Verification failed.");
    toast.success("Number verified");
    setOtpSent(false);
    setCode("");
    await mutate();
  }

  return (
    <form onSubmit={save} className="space-y-5">
      <Card>
        <CardHeader>
          <CardTitle>Business</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Business name"
            hint="Spoken by the agent on every call."
          >
            <Input
              name="name"
              defaultValue={ws.name}
              disabled={!canEdit}
              required
            />
          </Field>
          <Field label="City">
            <Input
              name="city"
              defaultValue={ws.city}
              disabled={!canEdit}
              required
            />
          </Field>
          <Field label="Owner name">
            <Input
              name="ownerName"
              defaultValue={ws.ownerName}
              disabled={!canEdit}
              required
            />
          </Field>
          <Field
            label="Owner mobile"
            hint="Receives the 19:15 daily brief call."
          >
            <Input
              name="ownerPhone"
              defaultValue={ws.ownerPhone}
              disabled={!canEdit}
              required
            />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            Owner number verification
            {ws.ownerPhoneVerified ? (
              <span className="inline-flex items-center gap-1 text-xs font-normal text-emerald-600">
                <BadgeCheck size={14} /> Verified
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-xs font-normal text-amber-600">
                <ShieldAlert size={14} /> Not verified
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Outside demo mode Chase will not place the daily brief call until
            the workspace proves it controls this number.
          </p>
          {canEdit && !ws.ownerPhoneVerified && (
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" variant="outline" onClick={sendCode}>
                {otpSent ? "Resend code" : "Send code"}
              </Button>
              {otpSent && (
                <>
                  <Input
                    value={code}
                    onChange={(event) => setCode(event.target.value)}
                    inputMode="numeric"
                    maxLength={6}
                    placeholder="6-digit code"
                    className="w-36"
                  />
                  <Button
                    type="button"
                    onClick={confirmCode}
                    disabled={code.length !== 6 || verifying}
                  >
                    {verifying ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : (
                      "Verify"
                    )}
                  </Button>
                </>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Getting paid</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Your UPI ID"
            hint="Payment links collect directly into this account. Chase never holds your money."
          >
            <Input
              name="upiVpa"
              defaultValue={ws.upiVpa ?? ""}
              placeholder="yourshop@okhdfcbank"
              disabled={!canEdit}
            />
          </Field>
          <Field label="Payee name" hint="Shown in the customer's UPI app.">
            <Input
              name="merchantName"
              defaultValue={ws.merchantName ?? ""}
              disabled={!canEdit}
            />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Contact conduct</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-3">
          <Field label="Calling from" hint="Never earlier than 08:00 IST.">
            <Input
              name="callWindowStart"
              type="time"
              defaultValue={ws.callWindowStart}
              disabled={!canEdit}
            />
          </Field>
          <Field label="Calling until" hint="Never later than 19:00 IST.">
            <Input
              name="callWindowEnd"
              type="time"
              defaultValue={ws.callWindowEnd}
              disabled={!canEdit}
            />
          </Field>
          <Field label="Minimum gap (hours)">
            <Input
              name="minGapHours"
              type="number"
              min={0}
              max={72}
              defaultValue={ws.minGapHours}
              disabled={!canEdit}
            />
          </Field>
          <Field label="Attempts per day">
            <Input
              name="maxAttemptsPerDay"
              type="number"
              min={1}
              max={5}
              defaultValue={ws.maxAttemptsPerDay}
              disabled={!canEdit}
            />
          </Field>
          <Field label="Attempts per week">
            <Input
              name="maxAttemptsPerWeek"
              type="number"
              min={1}
              max={20}
              defaultValue={ws.maxAttemptsPerWeek}
              disabled={!canEdit}
            />
          </Field>
        </CardContent>
      </Card>

      {canEdit && (
        <Button type="submit" disabled={saving}>
          {saving ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            "Save changes"
          )}
        </Button>
      )}
    </form>
  );
}
