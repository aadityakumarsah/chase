# Part 3 LLM layer

## Configuration and commands

Set `LLM_PROVIDER` and that provider's credential (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `OPENROUTER_API_KEY`, `GEMINI_API_KEY`, `GROQ_API_KEY`, `DEEPSEEK_API_KEY`, `TOGETHER_API_KEY`, or generic `LLM_API_KEY`). Generic `LLM_API_KEY` takes precedence for the selected primary provider. Custom compatible services require `LLM_BASE_URL`. No environment file is written by this layer.

Set `LLM_MODEL_FAST`, `LLM_MODEL_SMART`, and `LLM_MODEL_DEEP` to models available on the selected account. Existing project defaults are preserved, not claimed to have been live verified. Each task supports `LLM_MODEL_FOR_<UPPERCASE_TASK>`.

- FAST: dossier, supervisor, rating_rationale, ping.
- SMART: call_analysis, persona_sim, sim_judge, chat_proxy.
- DEEP: brief, prompt_pr.

Fallback requires both `LLM_FALLBACK_PROVIDER` and `LLM_FALLBACK_MODEL`, plus that provider's own key or `LLM_FALLBACK_API_KEY`. `LLM_FALLBACK_BASE_URL` is independent of the primary URL. A generic primary key is never forwarded to a different fallback host. Only provider failures qualify; validation errors, refusal, truncated output, cancellation, configuration errors and telemetry errors never trigger provider fallback. A stream cannot fall back after output has been emitted. Both attempts must fit the task deadline.

`LLM_JSON_MODE` and `LLM_FALLBACK_JSON_MODE` accept `auto`, `json_schema`, or `json_object`. Auto uses strict JSON Schema for the named compatible services except DeepSeek; DeepSeek and custom endpoints start with JSON mode. Explicit unsupported-format responses permit a format downgrade on the same provider. Other 400 errors do not. JSON mode gets one repair attempt with validation field paths/codes. Strict output is always validated locally and never repaired or sent to another provider after a validation failure.

- `pnpm llm:ping`: one tiny structured call per configured tier; fallback disabled so success proves the selected tier/provider.
- `RUN_LLM_EVALS=1 pnpm eval:analysis`: six fixture calls, requiring at least five successes and mandatory opt-out correctness. Without the flag the suite is skipped.
- `pnpm dossier:demo`: compile/cache and print Sharma's dossier from the seeded local database.
- `pnpm exec tsx scripts/verify-part3.ts`: local-demo-only database integration check. Uses an explicitly labelled fixture provider, restores the original dossier, and persists a `simulated_test` telemetry row. This does not establish LLM quality.

## Contracts and accounting

`getLLM()` exposes text, typed objects and streaming with a shared task router. System parts mark the final stable prefix boundary; Anthropic sends an ephemeral cache control on that block. Small prompts may not meet the provider's cache minimum, so cache tokens can legitimately be zero. Compatible providers report cache reads when their usage response supplies them; explicit Anthropic-style caching is not claimed for those providers.

Anthropic uses the installed SDK's `messages.parse` and `zodOutputFormat` with Zod 4. The parse wrapper normalizes only schema-declared enum values, and defers parsing errors long enough to inspect refusal/max-token stop reasons and retain usage. Local Zod validation still enforces numeric, length and semantic constraints. Tools carry strict schemas with preflight checks for 20 strict tools and 24 optional parameters. Streaming emits text/tool deltas and a final result; execution of tools and the HTTP proxy remain Part 9 work. Thinking is disabled, including supervisor and proxy requests; task depth here comes from explicit model routing and structured tasks.

Every provider attempt records task, provider/model, feature flags, usage, elapsed latency and sanitized success/error in `llm_calls`. Retries stay within the provider attempt; the JSON repair's returned usage is accumulated. Configuration failures record zero usage without claiming a network call occurred. Failed calls can have unknown usage if no provider usage response arrived; consumer-cancelled streams may also lack final usage. Errors never store raw SDK messages, headers or prompts. Telemetry failure is explicit and cannot cause a second paid provider call.

Migration 0002 adds nullable `estimated_cost_usd` and `pricing_source`. Optional `LLM_PRICING_JSON` maps `provider/model` to `{input, output, cacheRead, cacheWrite}` rates in USD per million tokens. Use verified account tariffs. Unknown costs remain null, not free. Costs are estimates from reported tokens, not an invoice or measured billing charge; OpenAI-compatible input totals include cached tokens, while Anthropic reports uncached input separately. No hard-coded tariff is silently maintained.

Dossier inputs use a repeatable-read DB snapshot and stable ordering, the last ten collection calls, up to fifty promises/payments, five messages, scheduled callbacks, active opt-outs, dispute status and pickup counts by language/IST time window. The source hash includes prompt version/content and the input. Unchanged input returns the persisted row; changed evidence during inference rejects a stale write. Unknown best-time windows map to SQL null. No LLM score replaces the deterministic Chase Rating.

Bolna variables accept explicit domain paise. The required integer `outstanding_rupees` floors fractional rupees to avoid overstating a debt; `outstanding_spoken` preserves the exact paise-derived amount. The minimum payment clamps to the balance even below ₹500. Call tokens stay inside the returned variables and are never logged. Variable preparation does not authorize or place a call.

## Official references checked 29 October 2026

- [Anthropic structured outputs](https://platform.claude.com/docs/en/build-with-claude/structured-outputs) — schema limitations, stop reasons, casing and strict limits. Installed SDK helper imports `zod/v4`.
- [OpenAI structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs) — strict response formats versus JSON mode.
- [OpenRouter API](https://openrouter.ai/docs/api_reference/overview) — compatible API and model-dependent format support.
- [Gemini compatibility](https://ai.google.dev/gemini-api/docs/openai) — `https://generativelanguage.googleapis.com/v1beta/openai/`.
- [Groq compatibility](https://console.groq.com/docs/openai) — `https://api.groq.com/openai/v1`.
- [DeepSeek API](https://api-docs.deepseek.com/) — `https://api.deepseek.com`.
- [Together compatibility](https://docs.together.ai/docs/inference/openai-compatibility) — `https://api.together.ai/v1`, replacing the historical `.xyz` default.

## Verification limitation

No LLM credentials were configured during Part 3 implementation. The private Anthropic credential request timed out. The three-tier ping and demo compilation fail explicitly with configuration errors; the enabled analysis eval likewise cannot run model inference. Mocked SDK tests and DB fixture checks are separate evidence and do not satisfy the live acceptance gate. After configuring credentials and account-valid model names, rerun the commands above before claiming Part 3 fully verified.
