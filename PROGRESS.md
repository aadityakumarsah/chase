# Chase progress

Submission target: 31 October 2026. Later parts follow the user's authoritative briefs.

- [x] Part 1 — Scaffold, validated environment, utilities, Bolna read client, auth, health, tooling, project brain.
- [x] Part 2 — Full product schema, fictional portfolio/history seed, CSV import, portfolio queries and deterministic Chase Rating.
- [x] Part 3 — LLM layer, Contact Dossier and analysis schema implemented; live Anthropic acceptance checks pass.
- [x] Part 4 — Bolna agents as code, protected prompts, guarded calls and browser lab; phone acceptance remains configuration-dependent.
- [x] Part 5 — Durable mid-call tools, hosted UPI page, demo/Razorpay confirmation, messaging and optional graph events.
- [x] Part 6 — Exhaustive contact gate, guarded dialer/campaigns, idempotent Bolna ingestion, post-call intelligence and promise sweeper.
- [x] Part 7 — Live operations dashboard and stage view; real-phone demo acceptance remains configuration-dependent.
- [ ] Part 8 — Daily management brief and owner call.
- [ ] Part 9 — Prompt PR generation, simulator and approval.
- [ ] Part 10 — Production hardening, deployment and final demo rehearsal.

## Resume state — 29 October 2026

Parts 1–3 are implemented. No outbound calls or real messages/payments were made. The local database contains the 24-debtor fictional seed, a live-generated Sharma dossier and LLM telemetry.

- Twenty tables with bigint paise, UTC timestamps, indexed foreign keys, database-maintained updated_at, per-business invoice uniqueness, and append-only audit events. Migration 0001 applied to the configured local Postgres database; generating again reports no schema drift.
- Seed includes 14 Hindi, 7 English/Hinglish and 3 Marathi contacts, simulated histories, dossiers and inactive Part 4 prompt placeholders. Normal seed is idempotent. Explicit --reset works twice consecutively; it is restricted to a local demo database without non-seed businesses/calls/prompts.
- Ranked output contains 24 debtors: Sharma General Store is fifth at 77/A; scored range 11–94; dispute, opt-out and wrong number are X. Probability and raw formula are preserved; an explicit global monotonic display curve reconciles the requested demo score with the supplied formula (see DECISIONS.md).
- CSV CLI and authenticated, same-origin POST /api/import/csv accept the ten-row sample with zero rejections. Re-import updates all ten without duplicates. Money parsing is decimal-exact, rows are transactional, and invoice ownership cannot change. All business ratings refresh after import because the maximum balance can change.
- Typecheck, lint, production build and 53 unit tests pass. scripts/verify-part2.ts confirms all 24 DB-derived feature sets match fixtures, rating history is retained, unchanged scores emit no rating.changed, and UPDATE/DELETE/TRUNCATE on events fail.
- Safe smoke: local database and read-only Bolna API reachable; agent list empty. Anthropic live verification is now complete (see Part 3 below). Owner/demo phones, allowlist, payment configuration and agent/voice IDs remain incomplete. No .env changes were made during this continuation.
- Hardship's 72-hour interval is returned as a routing constraint; actual dispatch/attempt enforcement awaits the compliance scheduler. Active-promise waiting and exclusions are ranking behavior, not a claim of complete calling safeguards.
- Payment page remains inert. Prompt placeholders are inactive. bolna:sync remains a Part 4 placeholder.

## Commands added in Part 2

- pnpm seed / pnpm seed --reset — create or explicitly reset the fictional local demo.
- pnpm rating:recompute — append rating history and print a ranked table.
- pnpm import:csv samples/receivables-sample.csv [business UUID] — import or update sample invoices.
- pnpm exec tsx scripts/verify-part2.ts — integration assertions against a freshly seeded local demo; appends one unchanged rating-history row.

API import accepts text/csv or multipart/form-data with a file field, an authenticated admin cookie and matching Origin. Optional businessId query parameter is required when multiple businesses exist. Limits: 2 MiB and 1,000 rows. The sample uses fictional reserved phones.

## Part 3 implementation — 29 October 2026

- Added provider-agnostic text/object/stream interfaces, FAST/SMART/DEEP routing, per-task overrides, explicit fallback credentials/endpoints, bounded retry and task deadlines.
- Native Anthropic SDK structured outputs with Zod 4, strict tools, prefix cache control, cache usage, case-normalized enums and explicit refusal/truncation errors. Compatible SDK presets use strict formats where supported, JSON mode with one repair otherwise.
- Persisted per-attempt telemetry and migration 0002 for nullable estimated USD cost and pricing provenance. Costs require configured rates; unknown cost remains null. No raw SDK errors or credentials are persisted.
- Dossier input aggregation, source hashing/caching, privacy-focused compilation prompt, and exact Bolna user_data preparation. Analysis schema and six Hinglish/English eval transcripts are implemented. No HTTP proxy, completed-call webhook or real calls were added.
- 83 unit tests, typecheck, lint and production build pass. Tests cover SDK request/stream fixtures, routing, fallback, failure handling, schema constraints and call variables. Local database verification confirms the broken promise on the 5th, pickup stats, cache reuse and explicitly labelled fixture telemetry; it restores the original seed dossier.
- Live verification after the user added the Anthropic key: all three `pnpm llm:ping` tiers pass (Haiku 5.5: 1,495 ms; Sonnet 5.5: 2,735 ms; Opus 5.5: 2,907 ms). `RUN_LLM_EVALS=1 pnpm eval:analysis` passes its at-least-five-of-six threshold and mandatory opt-out assertion. All six analysis calls wrote successful telemetry, with 2,863 cached input tokens each and 3.15–5.48 s latency.
- `pnpm dossier:demo` generated a 437-character dossier recording the broken ₹5,000 promise due 2026-10-05 and salary delay. A repeat compile reused the DB cache without another LLM call. The generation took 5,173 ms and wrote 1,312 prompt-cache tokens.
- Fixed live-discovered API compatibility: omit temperature on current models, use Sonnet 5.5 between_tools/low effort, Haiku disabled thinking, and Opus 5.5 adaptive thinking (low for ping, high for deep tasks). Opus 5.5 is rejected for supervisor/chat_proxy because always-on thinking cannot honor their no-upfront-thinking requirement.
- Fixed live eval configuration: Next ignores .env.local under NODE_ENV=test; opt-in live evals now explicitly load local development configuration before workers start. Ordinary unit tests remain offline. Historical failed attempts remain in telemetry rather than being erased.
- Compatible-provider live verification remains conditional on a configured key. USD costs remain null without operator-supplied pricing; token usage and cache metrics are verified. Queue/dispatch compliance remains future work.

See [docs/llm-layer.md](docs/llm-layer.md) for configuration, commands, accounting semantics, official sources and verification limits. Part 3 did not modify .env files.

## Part 4 implementation — 30 October 2026 (acceptance pending)

- Both Chase Collections and Chase Brief exist in Bolna. Their IDs and selected Sarvam Hindi-English voice were appended during sync; existing environment lines were preserved. Active v1 prompts live in Postgres and sync verifies prompt, webhook, tools, model, voice and guardrails with GET.
- Added typed agent/call/voice/session client operations, protected prompt sections, six authenticated tools, guarded explicit phone dispatch, execution/webhook ingestion and the authenticated `/lab` browser practice page. Payment, promise and callback actions remain clearly labelled simulations. Real-call stop/dispute requests persist protective holds; browser practice changes no customer account state.
- Dispatch enforces allowlist, hours, attempt caps, promise waiting, opt-out/dispute holds and in-flight reservations. No phone call has been placed. Owner briefing delivery and post-call LLM analysis remain later work.
- Fixed an integration failure where generic token redaction erased entity UUIDs from `agent.synced` events. New audit records preserve IDs while credentials remain redacted; historical records are retained.
- Typecheck, lint and 125 unit tests pass. Local DB/HTTP verification passes authentication, CSRF, call-token binding/revocation, idempotency, simulated effects and dossier preview. Smoke confirms database, Bolna and LLM reachability.
- The temporary Cloudflare tunnel and development server are running. Browser session minting, microphone capture, remote connection and speech recognition were exercised with synthetic microphone input. Bolna's execution transcript confirms the AI disclosure, identity question and a user response. Both webhook deliveries returned HTTP 200. This is not full conversational acceptance: the initial execution ended with `agent_llm_error` because Bolna's router did not recognize its documented `claude-sonnet-5` identifier.
- `DEMO_DEBTOR_PHONE` and `CALL_ALLOWLIST` remain missing, preventing the authorized real-phone acceptance test. `OWNER_PHONE`, `MERCHANT_UPI_VPA` and `MERCHANT_NAME` remain missing for later features. Part 4 remains unchecked until conversational and phone acceptance succeed.
- Follow-up browser test with the explicit Anthropic prefix fixed provider routing but failed with Anthropic `temperature is deprecated for this model`. Omitting temperature from the request does not solve it: GET returns Bolna's default 0.1. The user subsequently selected Haiku 4.5 (see verification below). The app's native Anthropic dossier layer is unaffected. The browser verification observed a completed execution with 13.1 seconds of audio and user transcription, but no successful LLM response; do not describe the conversation as passing.
- Resolved the voice-model blocker with the user's explicit Haiku 4.5 selection: appended `BOLNA_LLM_MODEL=claude-haiku-4-5-20251001` to `.env.local` without modifying `.env`, then synced and GET-verified both agents. A 39.7-second browser execution completed without LLM errors: AI welcome, user identity confirmation, honest “I am an AI assistant, not a human” response to the robot question, then ₹12,500/two-invoice disclosure. Synthetic microphone input was used; this is browser verification, not a phone call. Broken-promise wording and real-phone acceptance remain unverified.
- Browser end notifications now revoke tools with `call-disconnected` while permitting the later completed webhook to enrich final facts; they cannot overwrite an already terminal execution. Production build passes.

## Part 5 implementation — 30 October 2026

- Replaced tool stubs with 45-minute call/debtor binding, constant-time authentication, coercing Zod schemas, per-IP/per-call limits, durable idempotency, compact multilingual responses and invocation/feed audit rows.
- Implemented payment-link creation, console/Meta/Twilio messaging, UPI URI and SVG QR pay page, open tracking, clearly labelled demo simulation, Razorpay creation/signature verification, oldest-invoice allocation, promise resolution and rating refresh.
- Added callbacks with Sunday/window correction, confirmed promises, dispute holds and owner notification, opt-outs, WhatsApp inbound STOP handling and delivery status updates.
- Graph mode builds four event-driven nodes and injects `link_opened`/`payment_completed`; simple mode remains the configured fallback. No graph agent was synced during this part.
- Migrations 0003–0004 applied. Typecheck, lint, production build and 131 tests pass. The local HTTP verification completed auth, invalid amount, idempotent repeat, console delivery, pay-page open, simulated ₹2,000 payment, invoice allocation and paid-status checks. The payment is explicitly stored and spoken as simulated.
- Live Meta/Twilio/Razorpay credentials are not configured, so their request/signature boundaries are tested locally but external delivery was not attempted. The full voice-driven tool conversation and proactive graph response remain live acceptance checks.

## Part 6 implementation — 30 October 2026

- Added the pure, exhaustive R1–R11 compliance gate with ordered results, IST/hard-window/Sunday enforcement, daily/weekly caps, minimum and hardship gaps, promise-day reminders, owner-brief exemption, visible allowlisted demo override, combined `nextAllowedAt`, and durable decision audit records.
- Manual, campaign and callback dialing now share one gate. The dialer sends and records first-contact disclosure before the first dial, compiles the dossier, refreshes the rating, reserves a fresh call token under a debtor lock, records prompt/source, and sets Bolna's bypass flag only for a visible consenting-tester override. No Part 6 verification placed a phone call.
- Added authenticated same-origin start/refresh endpoints and a rating-plus-due-callback campaign planner. Dry runs return each candidate and reason; live runs re-gate every candidate, respect available concurrency, and space starts by 3–5 seconds.
- Bolna webhook ingestion follows the current execution-payload contract: loose schema, constant-time token, informational source-IP logging, execution/call-token reconciliation, monotonic lifecycle events, terminal-only final facts, transcript-based connection detection, cost, recording, first-audio latency and interruption metrics. Post-call work runs through `after()` and uses a reclaimable database claim to prevent concurrent duplicate analyses.
- Connected calls use SMART typed analysis with database tool invocations as truth. Reconciliation creates conservative unconfirmed transcript-only promises and inferred opt-out/dispute holds, persists flags, alerts the owner on high severity, refreshes dossier/rating, and uses FAST for a rationale under 20 words. No-conversation/voicemail calls use a deterministic record and make no LLM request.
- A previously completed real browser execution was GET-refreshed from Bolna and processed successfully: transcript, typed analysis, cost and latency are present, its dossier was refreshed, and its latest rating is 65 with a 19-word rationale. This validates the real web-call pipeline without placing a new call.
- Added `calls:poll`, `promises:sweep` and `verify:part6`. Replaying the same completed fixture three times produces one call and one `call.analyzed` event; the dry campaign returns five reasoned rows. Promise sweep is idempotent and resolved no pending overdue promises during verification.
- Added an explicit `after_hours` callback value so a 9 pm request is preserved as blocked rather than collapsed into “evening”; it moves to the next allowed morning, writes `gate_blocked`, emits `gate.blocked`, and returns the compliant explanation. Sync this updated tool schema against an active public HTTPS URL before the live 9 pm voice rehearsal.
- Migrations 0005–0006 are applied. Typecheck, lint, production build and 157 tests pass. External phone dialing was intentionally not used; the old temporary tunnel was not assumed to remain alive.

## Part 7 implementation — 31 October 2026

- Added the protected operator console with a dark-default/light theme, bundled Inter and Noto Sans Devanagari variable fonts, en-IN money, tabular figures, exact IST time tooltips, skeletons, empty states, animated KPIs/queue changes and the requested slate/navy, saffron, emerald, rose and amber visual language.
- Added admin-only summary, queue, event cursor, debtor/detail, call/detail/reanalysis, compliance, AI Ops and settings APIs. Queue/gate features come from one ranked SQL query and page read models batch their related data; live surfaces poll at 1.5 seconds and ordinary surfaces at 10 seconds without websockets.
- Command Center now includes five KPI cards, an animated Chase Queue with explicit gate reasons and next allowed time, the focused call pipeline/timeline/transcript/recording/owner summary, a clearly labelled console-message phone preview and event ticker. Simulated receipts remain visibly labelled in KPI, stage, event and message surfaces.
- Added Debtors with filters/search/CSV import rejection preview; debtor rating explanation, unified timeline, invoices, dossier, history chart and calls; call telemetry/transcript/tools/analysis/compliance review; R1–R11 policy and decision ledger with CSV export; Claude telemetry/caching/routing/latency/cost proof; and Part 8/9 placeholders.
- `/lab` retains the web-call tester and adds explicit simulated payment, 9 pm callback, demo override and guarded seed-reset controls. `/settings` reports configuration status without values, agent IDs/sync times, webhook/tool activity and APP_BASE_URL, plus explicit health and configured-agent sync actions. Settings sync updates and GET-verifies existing IDs only; it never creates agents or mutates environment files.
- `/stage` is a navigation-free 1920×1080 view with 20px-or-larger text, live call events, animated top-six queue/rationale changes, money/compliance strip, theme control and 1/2/3/R/F shortcuts. Shortcut 3 remains honestly labelled as Part 8; reset still requires confirmation and the server's local-demo safety checks.
- Runtime verification exercised every dashboard page and read API against the 24-debtor seed with authenticated HTTP 200 responses. Typecheck, lint, production build and all 157 tests pass. Read-model verification also caught and fixed postgres-js timestamp normalization across repeated queue requests.
- No real call, message, payment, reset or Bolna sync was triggered during Part 7 verification. `CALL_ALLOWLIST` and `DEMO_DEBTOR_PHONE` remain missing, so the requested real-phone “Call now” acceptance could not be safely executed; configured live use still passes through the Part 6 gate. Merchant identity and owner phone remain missing for Parts 5/8 live acceptance.
