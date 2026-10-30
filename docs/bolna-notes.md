# Bolna integration notes

Checked against official documentation on 29 October 2026. Live read-only smoke verification succeeded against `/user/me` and `/v2/agent/all`. No calls or agents were created.

Sources:

- https://www.bolna.ai/docs/AGENTS.md
- https://www.bolna.ai/docs/llms.txt
- https://www.bolna.ai/docs/api-reference/agent/v2/get_all.md
- https://www.bolna.ai/docs/api-reference/agent/v2/get.md
- https://nextjs.org/docs/app/api-reference/file-conventions/proxy

## Critical gotchas

- Base URL `https://api.bolna.ai`; every REST request uses Bearer authentication. Invalid credentials return 401. Keep headers and response bodies out of logs.
- V2 list endpoint is **GET `/v2/agent/all`**, returning a bare array. Agent fields include `id`, `agent_name`, `tasks`, `agent_prompts`, and `agent_status`. Detail endpoint: GET `/v2/agent/{agent_id}`.
- GET `/user/me` returns account data. Our smoke command prints only name, wallet and concurrency. The live concurrency field is an object with `max` and `current`.
- POST `/v2/agent` returns **201**, with `{ agent_id, state: "created" }`; the field is `state`, not `status`. POST `/batches` also returns 201 and accepts multipart `agent_id` and CSV `file`.
- POST `/call` returns `{ execution_id, status: "queued" }`. `from_phone_number` is optional except for trunk agents; omit it for the account default.
- `scheduled_at` must use **`+00:00`**, never a trailing `Z`; `Z` can produce a 500. Schedule at least two minutes ahead. Bolna rounds up to the next ten-minute mark. Chase rounds first so compliance can validate the actual scheduled slot; recheck the final slot before dispatch.
- Wait for **`completed`**, not `call-disconnected`, before post-call analysis. Duration, cost, recording and extracted data may be absent at disconnect. Other terminal states: `no-answer`, `busy`, `failed`, `canceled`, `stopped`, `error`, `balance-low`.
- `toolchain.pipelines` is nested: `[["transcriber", "llm", "synthesizer"]]`.
- GET `/batches/{batch_id}/executions` returns a bare array.
- Webhook source IPs documented by Bolna: `13.203.39.153`, `13.126.9.249`, `13.202.133.53`. Authentication is still required; do not use IP filtering as the sole credential.
- New SIP integration uses `/trunk`, telephony provider `trunk`, and a trunk-owned outbound caller ID. `/sip-trunks` and `sip-trunk` are legacy. Read POP settings from the API rather than hard-coding them.
- Sarvam transcription takes plain ISO language codes (`hi`, not `hi-IN`). Resolve TTS voice/model pairs from the live voice catalog in Part 4. Never invent voice IDs or silently substitute models.
- **Extraction migration:** the current docs index says legacy `custom_extractions`, `agent_extraction` and flat extraction keys were retired. Revisit https://www.bolna.ai/docs/migrating-to-extractions/overview.md before implementing Part 6. Call Summary now appears under `General > Call Summary` with a `subjective` value; the top-level webhook summary remains supported. Preserve raw external payloads only in appropriately access-controlled storage, never logs.

## Docs index landmarks for later parts

Use the fetched index to find the latest API quickstart, graph-agent reference, web-call sessions, custom functions/tools, post-call webhooks, multilingual config, voice catalog, Anthropic providers, and Extractions migration. The REST OpenAPI reference and observed live behavior take precedence over old examples.

## Skills

Installed all 20 Bolna skills into `.claude/skills/` using:

```sh
npx skills add bolna-ai/skills -a claude-code --yes
```

The noninteractive `--yes` flag selects all skills. Read the relevant skill before use. Project authorization and secret-handling rules take precedence over vendor examples. Skills are available to Claude Code on its next turn.

## Optional MCP connection (printed only; not executed)

```sh
claude mcp add --transport http bolna https://mcp.bolna.ai/api/mcp --header "Authorization: Bearer <BOLNA_API_KEY>" --scope user
```

Use the real credential only in your local secure setup; never paste it into this repository or chat.

## Part 4 live verification — 30 October 2026

- Both agents were created and GET-verified with active v1 prompts and the catalogued `simran_enhi_customer` voice. No phone numbers were returned by the account's phone-number list; omission of `from_phone_number` is supported but actual telephony remains unverified.
- `pnpm bolna:sync --base-url https://YOUR-PUBLIC-ORIGIN` uses an explicit temporary origin without rewriting `.env`. Start the server with the same `APP_BASE_URL` so login/CSRF and web-call session requests agree. If the tunnel changes, restart the server and repeat sync.
- `/lab` requires an admin login. Each session receives server-prepared context and an isolated call token. Browser tools are simulations; a session cannot use owner transfer. A synthetic-microphone browser check verified session minting, AI welcome, recognition of a user response and successful webhook delivery.
- Live blocker: the documented bare `claude-sonnet-5` fails Bolna's LiteLLM routing. `anthropic/claude-sonnet-5` resolves that, but the execution then fails because Claude rejects temperature. The builder omits temperature for modern Claude; Bolna fills 0.1 back in. Agent creation and GET success therefore do not establish conversational success. Use an explicitly selected supported voice model or await a Bolna fix; never silently switch models.
- Installed SDK declaration comments still mention `/web-call/freeswitch-session`; current official SDK documentation and successful live minting use `/web-call/session`.
- `pnpm exec tsx scripts/verify-part4.ts` exercises local DB/HTTP boundaries without calling Bolna. `pnpm call:test --to +91XXXXXXXXXX --debtor demo` is an explicit real phone call and enforces the allowlist and conduct gate. Do not use it as an implicit smoke check.
- Resolved for this demo by explicit user selection of `claude-haiku-4-5-20251001`. Both agents were resynced; a 39.7-second browser conversation completed with an honest AI response and debt disclosure only after identity confirmation. The Sonnet-specific provider limitation remains documented above.
