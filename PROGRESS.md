# Chase progress

Submission target: 31 October 2026. Parts after Part 1 are a working sequence, subject to the user's next briefs.

- [x] Part 1 — Scaffold, validated environment, utilities, Bolna read client, auth, health, tooling, project brain.
- [ ] Part 2 — Ledger schema, debtor/invoice import, demo seed and append-only domain events.
- [ ] Part 3 — Deterministic Chase Rating, queue, dossier features and compliance scheduling.
- [ ] Part 4 — Bolna agent sync, validated speech providers/voices, calling and live tools.
- [ ] Part 5 — UPI/Razorpay payments, messaging, promises, callbacks, disputes and opt-outs.
- [ ] Part 6 — Completed-call webhook ingestion, typed analysis and dossier updates.
- [ ] Part 7 — Live collections dashboard and operational review.
- [ ] Part 8 — Daily management brief and interactive owner call.
- [ ] Part 9 — Evidence-backed Prompt PRs, simulator and protected compliance checks.
- [ ] Part 10 — End-to-end demo, deployment, rehearsal and submission assets.

## Resume state

Part 1 is implemented and verified. No outbound calls have been implemented or placed.

- Typecheck, lint and all 25 tests pass.
- Production build passes; Next.js 16.4.3 uses src/proxy.ts.
- Development HTTP verification: 11 checks pass for login, health JSON, protected routes, forged-cookie rejection, same-origin enforcement and authenticated dashboard/feed.
- Live Bolna smoke succeeds with account name, wallet and concurrency; the agent list is empty.
- DATABASE_URL and LLM credentials are not configured, so DB connectivity/migration execution and a live LLM ping remain unverified. A migration is generated and committed, not applied.
- Five empty security entries received appended random values: CHASE_TOOL_SECRET, CHASE_WEBHOOK_SECRET, CHASE_PROXY_KEY, CRON_SECRET, ADMIN_PASSCODE. All original .env lines remain preserved and ignored by Git.
- See docs/config-status.md for missing canonical names. Provider status is configuration, not a claim of verified messaging/payment delivery.
- Installed 20 Bolna skills for Claude Code; optional MCP setup command is documented but not executed.

Next: privately configure DATABASE_URL and the chosen LLM credential, then provide the Part 2 brief. The current login is at http://localhost:3000/login; use ADMIN_PASSCODE from the local environment. The Part 2 seed and Part 4 agent-sync commands remain safe placeholders.
