"use client";
import { useState, type FormEvent, type ReactNode } from "react";
import { Loader2, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";

/**
 * Adds one receivable account by hand.
 *
 * Grouped into the four questions a shopkeeper actually answers: who they are,
 * where they are, what they owe, and what they have already promised. The
 * invoice and promise sections are optional so an account can be opened before
 * a bill exists, and contact permission is an explicit choice rather than a
 * default, because it is what licenses Chase to ring them at all.
 */

const SEGMENTS = [
  ["kirana", "Kirana / grocery"],
  ["medical", "Medical / pharmacy"],
  ["restaurant", "Restaurant / hotel"],
  ["hardware", "Hardware / building"],
  ["other", "Other"],
] as const;

const LANGUAGES = [
  ["hi", "Hindi"],
  ["en", "English / Hinglish"],
  ["mr", "Marathi"],
] as const;

const CONSENT = [
  ["ledger_customer", "They are a customer in our ledger"],
  ["written_contract", "We hold a written contract"],
  ["prior_relationship", "We have an existing business relationship"],
  ["explicit_consent", "They explicitly agreed to be contacted"],
] as const;

const today = () => new Date().toISOString().slice(0, 10);

export function AddDebtorDialog({ onAdded }: { onAdded?: () => void }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [withInvoice, setWithInvoice] = useState(true);
  const [withPromise, setWithPromise] = useState(false);

  const [form, setForm] = useState({
    shopName: "",
    contactName: "",
    phone: "",
    city: "",
    segment: "other",
    language: "hi",
    consentBasis: "ledger_customer",
    notes: "",
    invoiceNo: "",
    issuedOn: today(),
    dueOn: today(),
    amountRupees: "",
    paidRupees: "0",
    promiseAmountRupees: "",
    promisedFor: today(),
  });
  const set = (key: keyof typeof form) => (value: string) =>
    setForm((previous) => ({ ...previous, [key]: value }));

  function reset() {
    setForm({
      shopName: "",
      contactName: "",
      phone: "",
      city: "",
      segment: "other",
      language: "hi",
      consentBasis: "ledger_customer",
      notes: "",
      invoiceNo: "",
      issuedOn: today(),
      dueOn: today(),
      amountRupees: "",
      paidRupees: "0",
      promiseAmountRupees: "",
      promisedFor: today(),
    });
    setWithInvoice(true);
    setWithPromise(false);
    setError(null);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/debtors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shopName: form.shopName,
          contactName: form.contactName,
          phone: form.phone,
          city: form.city || undefined,
          segment: form.segment,
          language: form.language,
          consentBasis: form.consentBasis,
          notes: form.notes || undefined,
          invoice: withInvoice
            ? {
                invoiceNo: form.invoiceNo,
                issuedOn: form.issuedOn,
                dueOn: form.dueOn,
                amountRupees: form.amountRupees,
                paidRupees: form.paidRupees || "0",
              }
            : undefined,
          promise:
            withInvoice && withPromise
              ? {
                  amountRupees: form.promiseAmountRupees,
                  promisedFor: form.promisedFor,
                }
              : undefined,
        }),
      });
      const body = (await response.json()) as { error?: string };
      if (!response.ok)
        throw new Error(body.error ?? "Could not save that account.");
      toast.success(`${form.shopName} added to the portfolio`);
      reset();
      setOpen(false);
      onAdded?.();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not save that account.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline">
          <UserPlus size={16} /> Add account
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Add a receivable account</DialogTitle>
          <DialogDescription>
            For a shop that is not in a ledger export yet. Everything except the
            invoice and promise is required.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-5">
          <Section title="Who you are chasing">
            <Field label="Shop or business name" htmlFor="shopName">
              <Input
                id="shopName"
                required
                maxLength={200}
                value={form.shopName}
                onChange={(e) => set("shopName")(e.target.value)}
                placeholder="Shree Ganesh Kirana"
              />
            </Field>
            <Field label="Contact person" htmlFor="contactName">
              <Input
                id="contactName"
                required
                maxLength={200}
                value={form.contactName}
                onChange={(e) => set("contactName")(e.target.value)}
                placeholder="Rakesh Agarwal"
              />
            </Field>
            <Field
              label="Mobile number"
              htmlFor="phone"
              hint="Indian mobile. +91 is added automatically."
            >
              <Input
                id="phone"
                required
                inputMode="tel"
                value={form.phone}
                onChange={(e) => set("phone")(e.target.value)}
                placeholder="98765 43210"
              />
            </Field>
            <Field label="Call language" htmlFor="language">
              <Choice
                value={form.language}
                onChange={set("language")}
                options={LANGUAGES}
              />
            </Field>
          </Section>

          <Separator />

          <Section title="Where they are">
            <Field
              label="City or area"
              htmlFor="city"
              hint="Leave blank to use your workspace city."
            >
              <Input
                id="city"
                maxLength={120}
                value={form.city}
                onChange={(e) => set("city")(e.target.value)}
                placeholder="Pune"
              />
            </Field>
            <Field label="Business type" htmlFor="segment">
              <Choice
                value={form.segment}
                onChange={set("segment")}
                options={SEGMENTS}
              />
            </Field>
          </Section>

          <Separator />

          <Section
            title="What they owe"
            toggle={{ checked: withInvoice, onChange: setWithInvoice }}
          >
            {withInvoice ? (
              <>
                <Field label="Invoice number" htmlFor="invoiceNo">
                  <Input
                    id="invoiceNo"
                    required
                    maxLength={200}
                    value={form.invoiceNo}
                    onChange={(e) => set("invoiceNo")(e.target.value)}
                    placeholder="INV-2026-104"
                  />
                </Field>
                <Field label="Amount (₹)" htmlFor="amountRupees">
                  <Input
                    id="amountRupees"
                    required
                    inputMode="decimal"
                    value={form.amountRupees}
                    onChange={(e) => set("amountRupees")(e.target.value)}
                    placeholder="24500"
                  />
                </Field>
                <Field label="Already paid (₹)" htmlFor="paidRupees">
                  <Input
                    id="paidRupees"
                    inputMode="decimal"
                    value={form.paidRupees}
                    onChange={(e) => set("paidRupees")(e.target.value)}
                    placeholder="0"
                  />
                </Field>
                <Field label="Invoice date" htmlFor="issuedOn">
                  <Input
                    id="issuedOn"
                    type="date"
                    required
                    value={form.issuedOn}
                    onChange={(e) => set("issuedOn")(e.target.value)}
                  />
                </Field>
                <Field label="Due date" htmlFor="dueOn">
                  <Input
                    id="dueOn"
                    type="date"
                    required
                    value={form.dueOn}
                    onChange={(e) => set("dueOn")(e.target.value)}
                  />
                </Field>
              </>
            ) : (
              <p className="col-span-2 text-xs text-muted-foreground">
                The account will be created with no balance. You can import or
                add invoices later.
              </p>
            )}
          </Section>

          {withInvoice && (
            <>
              <Separator />
              <Section
                title="Already promised to pay"
                toggle={{ checked: withPromise, onChange: setWithPromise }}
              >
                {withPromise ? (
                  <>
                    <Field label="Promised amount (₹)" htmlFor="promiseAmount">
                      <Input
                        id="promiseAmount"
                        required
                        inputMode="decimal"
                        value={form.promiseAmountRupees}
                        onChange={(e) =>
                          set("promiseAmountRupees")(e.target.value)
                        }
                        placeholder="5000"
                      />
                    </Field>
                    <Field label="Promised for" htmlFor="promisedFor">
                      <Input
                        id="promisedFor"
                        type="date"
                        required
                        value={form.promisedFor}
                        onChange={(e) => set("promisedFor")(e.target.value)}
                      />
                    </Field>
                  </>
                ) : (
                  <p className="col-span-2 text-xs text-muted-foreground">
                    Turn this on if they have already agreed a date and amount.
                  </p>
                )}
              </Section>
            </>
          )}

          <Separator />

          <Section title="Why you may contact them">
            <div className="col-span-2 space-y-1.5">
              <Choice
                value={form.consentBasis}
                onChange={set("consentBasis")}
                options={CONSENT}
                full
              />
              <p className="text-xs text-muted-foreground">
                Chase records this against the account. Without a basis it will
                never dial the number.
              </p>
            </div>
            <Field label="Notes (optional)" htmlFor="notes" full>
              <Input
                id="notes"
                maxLength={2000}
                value={form.notes}
                onChange={(e) => set("notes")(e.target.value)}
                placeholder="Pays after the 10th, speaks to the son"
              />
            </Field>
          </Section>

          {error && (
            <p
              role="alert"
              className="rounded-md border border-rose-500/30 bg-rose-500/5 p-3 text-xs text-rose-600 dark:text-rose-400"
            >
              {error}
            </p>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setOpen(false)}
              disabled={busy}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              {busy && <Loader2 size={15} className="animate-spin" />}
              {busy ? "Saving…" : "Add account"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Section({
  title,
  children,
  toggle,
}: {
  title: string;
  children: ReactNode;
  toggle?: { checked: boolean; onChange: (value: boolean) => void };
}) {
  return (
    <fieldset className="space-y-3">
      <div className="flex items-center justify-between">
        <legend className="text-[11px] font-semibold tracking-widest text-muted-foreground uppercase">
          {title}
        </legend>
        {toggle && (
          <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={toggle.checked}
              onChange={(event) => toggle.onChange(event.target.checked)}
              className="size-3.5 accent-foreground"
            />
            Include
          </label>
        )}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">{children}</div>
    </fieldset>
  );
}

function Field({
  label,
  htmlFor,
  hint,
  children,
  full = false,
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  children: ReactNode;
  full?: boolean;
}) {
  return (
    <div className={full ? "col-span-2 space-y-1.5" : "space-y-1.5"}>
      <label htmlFor={htmlFor} className="text-xs font-medium">
        {label}
      </label>
      {children}
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

function Choice({
  value,
  onChange,
  options,
  full = false,
}: {
  value: string;
  onChange: (value: string) => void;
  options: readonly (readonly [string, string])[];
  full?: boolean;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className={full ? "w-full" : undefined}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map(([key, label]) => (
          <SelectItem key={key} value={key}>
            {label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
