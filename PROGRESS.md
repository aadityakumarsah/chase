# Chase progress

Submission target: 31 October 2026. Later parts follow the user's authoritative briefs.

- [x] Part 1 — Scaffold, validated environment, utilities, Bolna read client, auth, health, tooling, project brain.
- [x] Part 2 — Full product schema, fictional portfolio/history seed, CSV import, portfolio queries and deterministic Chase Rating.
- [ ] Part 3 — LLM layer, Contact Dossier and analysis schema implemented; live provider acceptance checks blocked by missing credentials.
- [ ] Parts 4–10 — Calling/tools, payment/messaging delivery, completed-call analysis, dashboard, owner briefs, Prompt PRs and final demo, as assigned by later briefs.

## Resume state — 29 October 2026

Part 2 is implemented. No outbound calls or real messages/payments were made. The local database is left with the fresh 24-debtor fictional seed.

- Twenty tables with bigint paise, UTC timestamps, indexed foreign keys, database-maintained updated_at, per-business invoice uniqueness, and append-only audit events. Migration 0001 applied to the configured local Postgres database; generating again reports no schema drift.
- Seed includes 14 Hindi, 7 English/Hinglish and 3 Marathi contacts, simulated histories, dossiers and inactive Part 4 prompt placeholders. Normal seed is idempotent. Explicit --reset works twice consecutively; it is restricted to a local demo database without non-seed businesses/calls/prompts.
- Ranked output contains 24 debtors: Sharma General Store is fifth at 77/A; scored range 11–94; dispute, opt-out and wrong number are X. Probability and raw formula are preserved; an explicit global monotonic display curve reconciles the requested demo score with the supplied formula (see DECISIONS.md).
- CSV CLI and authenticated, same-origin POST /api/import/csv accept the ten-row sample with zero rejections. Re-import updates all ten without duplicates. Money parsing is decimal-exact, rows are transactional, and invoice ownership cannot change. All business ratings refresh after import because the maximum balance can change.
- Typecheck, lint, production build and 53 unit tests pass. scripts/verify-part2.ts confirms all 24 DB-derived feature sets match fixtures, rating history is retained, unchanged scores emit no rating.changed, and UPDATE/DELETE/TRUNCATE on events fail.
- Safe smoke: local database and read-only Bolna API reachable; agent list empty. Anthropic credentials remain missing, so live LLM verification is unavailable. Owner/demo phones, allowlist, payment configuration and agent/voice IDs remain incomplete. No .env changes were made during this continuation.
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
- 82 unit tests, typecheck, lint and production build pass. Tests cover SDK request/stream fixtures, routing, fallback, failure handling, schema constraints and call variables. Local database verification confirms the broken promise on the 5th, pickup stats, cache reuse and explicitly labelled fixture telemetry; it restores the original seed dossier.
- `pnpm llm:ping` and `pnpm dossier:demo` were attempted and fail with missing-credential configuration errors. `RUN_LLM_EVALS=1 pnpm eval:analysis` also fails for all six because no model request can be made; this is not a quality score. Without the opt-in flag the eval is skipped. Anthropic and every compatible-provider key are absent, and the private key request timed out. No live 5/6 pass or generated dossier is claimed.
- Next: provide credentials privately, select account-valid tier models, run all live gates, and verify cache/token telemetry. Queue/dispatch compliance remains future work.

See [docs/llm-layer.md](docs/llm-layer.md) for configuration, commands, accounting semantics, official sources and verification limits. Part 3 did not modify .env files.
