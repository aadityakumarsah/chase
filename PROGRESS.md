# Chase progress

Submission target: 31 October 2026. Later parts follow the user's authoritative briefs.

- [x] Part 1 — Scaffold, validated environment, utilities, Bolna read client, auth, health, tooling, project brain.
- [x] Part 2 — Full product schema, fictional portfolio/history seed, CSV import, portfolio queries and deterministic Chase Rating.
- [x] Part 3 — LLM layer, Contact Dossier and analysis schema implemented; live Anthropic acceptance checks pass.
- [ ] Parts 4–10 — Calling/tools, payment/messaging delivery, completed-call analysis, dashboard, owner briefs, Prompt PRs and final demo, as assigned by later briefs.

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
