"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Loader2 } from "lucide-react";
import styles from "@/components/marketing/marketing.module.css";

type FieldError = { path: string; message: string };

/**
 * One-screen workspace setup. Everything here used to live in environment
 * variables, which is exactly what made the old build single-tenant.
 */
export function OnboardingForm({ defaultName }: { defaultName: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<FieldError[]>([]);

  const fieldError = (name: string) =>
    fields.find((f) => f.path === name)?.message;

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setFields([]);
    const form = new FormData(event.currentTarget);
    const phoneRaw = String(form.get("ownerPhone") ?? "").replace(/[\s-]/g, "");
    const payload = {
      name: String(form.get("name") ?? ""),
      ownerName: String(form.get("ownerName") ?? ""),
      // Indian numbers are typed without a country code more often than not.
      ownerPhone: phoneRaw.startsWith("+")
        ? phoneRaw
        : `+91${phoneRaw.replace(/^0+/, "")}`,
      city: String(form.get("city") ?? ""),
      defaultLanguage: String(form.get("defaultLanguage") ?? "hi"),
      upiVpa: String(form.get("upiVpa") ?? "").trim() || undefined,
      merchantName: String(form.get("merchantName") ?? "").trim() || undefined,
      contactPolicyAccepted: form.get("contactPolicyAccepted") === "on",
    };
    try {
      const response = await fetch("/api/workspaces", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await response.json();
      if (!response.ok) {
        setError(body.error ?? "Could not create the workspace.");
        setFields(body.fields ?? []);
        return;
      }
      router.push("/dashboard");
      router.refresh();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit}>
      <div>
        <label htmlFor="name">Business name</label>
        <input
          id="name"
          name="name"
          required
          maxLength={120}
          placeholder="Shree Ganesh Traders"
        />
        <small>
          The agent says this on every call: “मैं Shree Ganesh Traders से बोल
          रही हूँ.”
        </small>
        {fieldError("name") && (
          <small className={styles.authError}>{fieldError("name")}</small>
        )}
      </div>

      <div className={styles.onboardRow}>
        <div>
          <label htmlFor="ownerName">Your name</label>
          <input
            id="ownerName"
            name="ownerName"
            required
            maxLength={120}
            defaultValue={defaultName}
          />
        </div>
        <div>
          <label htmlFor="ownerPhone">Your mobile number</label>
          <input
            id="ownerPhone"
            name="ownerPhone"
            required
            inputMode="tel"
            placeholder="98765 43210"
          />
          <small>Where the daily brief calls you. Verify it later.</small>
          {fieldError("ownerPhone") && (
            <small className={styles.authError}>
              {fieldError("ownerPhone")}
            </small>
          )}
        </div>
      </div>

      <div className={styles.onboardRow}>
        <div>
          <label htmlFor="city">City</label>
          <input
            id="city"
            name="city"
            required
            maxLength={80}
            placeholder="Pune"
          />
        </div>
        <div>
          <label htmlFor="defaultLanguage">
            Language your customers prefer
          </label>
          <select id="defaultLanguage" name="defaultLanguage" defaultValue="hi">
            <option value="hi">Hindi / Hinglish</option>
            <option value="en">English</option>
            <option value="mr">Marathi</option>
          </select>
        </div>
      </div>

      <div className={styles.onboardRow}>
        <div>
          <label htmlFor="upiVpa">Your UPI ID (optional)</label>
          <input
            id="upiVpa"
            name="upiVpa"
            maxLength={120}
            placeholder="yourshop@okhdfcbank"
          />
          <small>
            Payment links collect straight into your account. Chase never holds
            your money.
          </small>
          {fieldError("upiVpa") && (
            <small className={styles.authError}>{fieldError("upiVpa")}</small>
          )}
        </div>
        <div>
          <label htmlFor="merchantName">Payee name (optional)</label>
          <input
            id="merchantName"
            name="merchantName"
            maxLength={120}
            placeholder="Shown in the customer's UPI app"
          />
        </div>
      </div>

      <label className={styles.consentBox} htmlFor="contactPolicyAccepted">
        <input
          id="contactPolicyAccepted"
          name="contactPolicyAccepted"
          type="checkbox"
          required
        />
        <span>
          I confirm the people Chase will call are my own customers with unpaid
          dues, and I accept the contact policy: calls only between 09:00 and
          18:30 IST, capped attempts, opt-outs honoured permanently, and the
          agent always discloses that it is an AI.
        </span>
      </label>

      {error && (
        <p role="alert" className={styles.authError}>
          {error}
        </p>
      )}

      <button type="submit" className={styles.primaryButton} disabled={busy}>
        {busy ? (
          <>
            <Loader2 size={16} className={styles.spin} /> Creating…
          </>
        ) : (
          <>
            Create workspace <ArrowRight size={16} />
          </>
        )}
      </button>
    </form>
  );
}
