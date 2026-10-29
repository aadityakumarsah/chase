# Chase progress

Submission target: 31 October 2026. Later parts follow the user's authoritative briefs.

- [x] Part 1 — Scaffold, validated environment, utilities, Bolna read client, auth, health, tooling, project brain.
- [x] Part 2 — Full product schema, fictional portfolio/history seed, CSV import, portfolio queries and deterministic Chase Rating.
- [ ] Part 3 — Next user brief; queue and compliance scheduling remain unimplemented.
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
