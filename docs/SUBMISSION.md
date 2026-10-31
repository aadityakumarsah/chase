# Submission pack

## Current blockers

- `DEMO_DEBTOR_PHONE`, `OWNER_PHONE`, `CALL_ALLOWLIST` and `DEMO_VIEW_PASSCODE` are unset.
- The Bolna email/form URL and the final unlisted video URL are not available in this workspace.

The repository must not claim submission, rehearsals, deployment or phone acceptance until these are resolved.

## 100-word description

Chase is the receivables and respectful collections operating layer for Indian SMBs. Bolna makes natural Hinglish calls; Chase decides who to call, enforces contact rules, and gives the agent tools to send payment links, record promises, schedule compliant callbacks, flag disputes, and honour opt-outs. Claude turns each conversation into typed outcomes, refreshed dossiers, explainable ratings, and a numbers-guarded owner brief. An eight-persona simulator red-teams privacy, AI disclosure, pressure, hardship, disputes, and third parties. Evidence-backed Prompt PRs improve the agent only after deterministic validation, base-versus-candidate simulation, and human approval. Bolna makes the call. Chase gets you paid, with restraint built in.

## Form fields

- **Project:** Chase
- **Tagline:** Bolna makes the call. Chase gets you paid.
- **Category:** Voice AI / fintech operations / accounts receivable
- **Repository:** https://github.com/aadityakumarsah/chase
- **Live app:** https://chase-liard.vercel.app
- **Read-only passcode:** pending `DEMO_VIEW_PASSCODE`
- **Video:** pending unlisted URL, verified logged out
- **Team:** Aaditya Sah — product, engineering and voice AI

## Likely YC questions

### Why you?

I built Chase end to end across voice orchestration, deterministic policy, payments, typed AI analysis and operator UX. The product comes from a specific view: the call is becoming cheap, but collections outcomes depend on the operating system around it—who gets called, what the agent may do, what becomes durable truth, and how the system improves without weakening conduct.

### Distribution?

Start with Indian distributors and wholesalers already exporting receivables from Tally or spreadsheets. Sell through accountants, Tally implementers and vertical SaaS partners, then land directly with a narrow “broken promises and owner time saved” demo. The product can expand from a single collections queue into schools, clinics and regulated-lender partner workflows.

### Compliance risk?

Chase does not market itself as legal certification. Contact hours, consent, opt-outs, disputes, caps and privacy are deterministic gates outside the model; protected prompt sections are immutable; decisions are append-only; simulations and payments are labelled. Regulated deployments still require institution-specific policy, legal review, monitoring and grievance processes.

### What stops Bolna from building this?

Bolna should remain the best voice orchestration layer. Chase is vertical workflow and system-of-record depth: ledger ingestion, account ranking, conduct policy, durable collection actions, payments, dossiers, management intelligence and an evidence-driven prompt lifecycle. A strong Bolna makes Chase better; replacing it would distract from the receivables data and operating loop where the defensibility compounds.

## Final submission checklist

- [x] `pnpm verify:e2e` is fully green against production.
- [ ] Three real-phone rehearsal rows in `docs/DEMO.md` contain timings.
- [ ] `docs/assets/chase-stage.gif` and the unlisted video are final.
- [ ] `pnpm secret:scan` passes immediately before push.
- [ ] Public repository opens in a logged-out browser.
- [ ] Live demo passcode cannot mutate calls, prompts, settings or demo controls.
- [ ] Video plays while logged out and is three minutes or less.
- [ ] Form receipt or confirmation is saved outside the repository.
