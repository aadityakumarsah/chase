# Chase three-minute demo runbook

## Roles and setup

- **Presenter:** runs `/stage` at 1920×1080 on the laptop and owns the narration.
- **Debtor teammate:** holds the phone in `DEMO_DEBTOR_PHONE` and reads only the lines below.
- **Owner:** the presenter’s own allowlisted `OWNER_PHONE`; shortcut `3` starts the Daily Management Brief.

The stage legend appears for five seconds. `1` starts the guarded demo call, `2` confirms the active link through the clearly labelled simulator, `3` starts the owner brief, `R` confirms and resets the fictional portfolio, and `F` toggles fullscreen.

## Time-coded script

### 0:00–0:20 — Problem

Presenter: “Indian SMBs run on credit, and chasing dues is the owner’s worst job. Voice AI can now make the call; nothing does the work after it. Chase is the brain around that call.”

Show the outstanding KPI, Chase Queue and the live compliance strip.

### 0:20–1:30 — Live collection call

Press `1`.

The debtor teammate waits for the AI disclosure and identity question, then says:

> “हाँ जी, मैं Suresh Sharma बोल रहा हूँ।”

After the agent recalls the broken promise:

> “हाँ, पिछली बार 5 तारीख बोला था। Salary late है। अभी सिर्फ 2,000 दे सकता हूँ।”

After the link arrives:

> “WhatsApp पर link आ गया। मैं खोल रहा हूँ।”

Open the link. Use Razorpay test mode if configured; otherwise press `2` and explicitly say “I’m using Chase’s labelled payment simulator for the demo.” In graph mode the payment event is injected into the conversation; otherwise say:

> “Payment हो गया?”

Expected stage moments: link sent, phone mockup update, link opened, simulated/test payment in emerald, agent acknowledgement, rating rationale and queue movement.

### 1:30–2:00 — Restraint

The teammate says:

> “बाकी के लिए रात 9 बजे call करना।”

The agent should explain that Chase does not call after hours and offer the next allowed morning. The stage must show the blocked requested slot, rule and moved slot in rose/amber.

### 2:00–2:40 — Intelligence

Open the changed account rationale and `/prompt-prs`. Show the evidence quotes, protected-section validation, base-versus-candidate persona table and human Approve/Roll back controls. Do not approve during the timed demo unless the deployed Bolna sync has already been rehearsed.

### 2:40–3:00 — Finale

Return to `/stage` and press `3`. The presenter’s phone should ring with the owner brief. Let the opening figures play, then close:

> “Bolna makes the call. Chase gets you paid.”

## If the agent goes off-script

- If it asks for identity again, answer once: “हाँ, मैं Suresh Sharma, दुकान का owner।” Never provide an OTP or unrelated personal detail.
- If it misses the ₹2,000 amount, repeat: “Two thousand rupees अभी pay कर सकता हूँ; WhatsApp link भेजिए।”
- If it does not use the link tool after one retry, end the call and switch to the rehearsed web-call fallback; do not improvise account facts.
- If it pressures, threatens, discloses before identity, or ignores an opt-out, stop the demo. Treat that as a failed safety check, not a performance glitch.

## Fallback ladder

1. Bad phone network → run the same conversation through the Web Call tester in `/lab`.
2. WhatsApp provider failure → use the persisted console provider and stage phone mockup; say that it is the demo console.
3. Razorpay failure → press `2` and call it the payment simulator aloud.
4. Broader provider outage → play the checked backup video and keep the dashboard live for the rating, compliance and Prompt PR sections.

## Pre-flight checklist

- [ ] Production `/api/health` is green and `/settings` has no required missing integration.
- [ ] Bolna wallet balance and available concurrency are sufficient.
- [ ] `CALL_ALLOWLIST` contains the debtor and owner phones, exactly in E.164.
- [ ] The demo phone has messaged the WhatsApp business number in the previous 24 hours.
- [ ] The Meta token is long-lived, or the console fallback is selected and labelled.
- [ ] The correct Bolna tool schema—including `after_hours`—is GET-verified after sync.
- [ ] The demo override is visible if the slot is outside 09:00–18:30 IST.
- [ ] `pnpm demo:reset` passes: zero calls today, rating 75–80, one broken promise, one open Prompt PR.
- [ ] Phones are charged, loud and off Do Not Disturb; laptop notifications are hidden.
- [ ] `/stage` is 1920×1080, fullscreen, dark theme, and the backup video plays while logged out.

## Rehearsal log

Do not mark a rehearsal complete without running the deployed flow with the actual two phones.

| Run | Date/time IST             | Call | Restraint | Prompt PR | Owner brief | Total | Result                          |
| --- | ------------------------- | ---: | --------: | --------: | ----------: | ----: | ------------------------------- |
| 1   | Pending production phones |    — |         — |         — |           — |     — | Blocked: phones/allowlist unset |
| 2   | Pending production phones |    — |         — |         — |           — |     — | Blocked: phones/allowlist unset |
| 3   | Pending production phones |    — |         — |         — |           — |     — | Blocked: phones/allowlist unset |
