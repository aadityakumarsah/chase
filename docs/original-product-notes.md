about bolna: [bolna](https://www.bolna.ai)
Bolna handles the complexity of voice infra, so enterprises can automate calls faster, better, and cheaper, at scale

Bolna is a Voice AI Orchestration platform purpose-built for Indian enterprises.
Businesses in India run tens of thousands of calls every day - across sales, support, collections, recruitment, and more. Bolna gives them the power to build and deploy Voice AI Agents directly from their transcripts and FAQs, so they can start automating calls immediately.

With Bolna, enterprises get:

1. Full control over agent intelligence, tone, and workflows
2. Cost efficiency at scale with smart routing across providers and price points
3. Enterprise-grade performance on latency, interruptions, multi-language, and multi-accent understanding

bolna docs [bolna](https://www.bolna.ai/docs)

about bolna buildathon : [buildthon](https://www.bolna.ai/symphony/buildathon)
Bring any idea.
Give it a voice.
Build whatever you like, as long as voice is part of it. A new product, or a voice feature on something you've already built. The Buildathon is fully virtual. Only the top 3 teams come to Bengaluru to pitch on the Abhyas stage at Symphony on 20th Nov, and we cover their travel.

Apply & Build
Register and start
building your idea.

02

Submit
Deadline to submit
your project.

03

Shortlist
Selected teams get an
interview invite by email.

04

Interview
Interviews with
selected teams.

05

Results
Finalists announced. Top 10
win free Symphony tickets.

06

Grand Finale
Top 3 pitch to the crowd
at Abhyas Hall.

and i want to build "Chase"
Positioning

“Bolna makes the call. Chase gets you paid.” It is a receivables and collections operating layer for Indian SMB distributors, wholesalers, schools, clinics and small NBFC/fintech partners. Lead with B2B SMB invoice dues, because it is less regulated than lender recovery and has a huge market. Show that Chase already enforces the RBI recovery-agent rules (see Compliance below), so it is ready for lenders too.

architecture sketch:

Ledger CSV / Tally export / Google Sheet
│
[Chase backend: FastAPI + Postgres]
│ (1) Chase Rating engine (deterministic, explainable)
│ (2) Contact Dossier builder ── Claude (long context, past executions)
│ (3) Call scheduler (respects allowed hours, opt-out ledger, attempt caps)
▼
Bolna /call API (user_data = dossier, amount, language; agent_data.language = hi/mr/ta…)
│
Bolna agent: STT (Deepgram/Sarvam) → LLM → TTS (Cartesia/Sarvam) over Plivo/Exotel
│ LLM = Claude via either:
│ A) Bolna native Anthropic provider (fastest to ship), or
│ B) Custom LLM → your OpenAI-compatible proxy (LiteLLM-style) → Claude
│ └── parallel Claude "Supervisor" checks each turn (policy veto/rewrite)
│
Mid-call custom functions (strict schemas) → Chase API:
get_dossier · create_upi_link(amount) → WhatsApp send · record_promise(date, amount, reason)
· flag_dispute · request_callback(time) · transfer_to_owner · opt_out
│
Bolna webhook (wait for status=completed) → extracted_data + transcript
│
Claude post-call: strict structured output → PTP record, reason code, sentiment, risk signals
│
Nightly: Claude Management Brief + Prompt-PR proposals
→ delivered as a Bolna outbound CALL to the owner + WhatsApp PDF
