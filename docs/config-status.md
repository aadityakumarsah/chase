# Configuration status

Part 1 snapshot; names only. Run pnpm smoke for current connectivity and integration status.

## Missing for selected integrations and upcoming demo

- DATABASE_URL
- ANTHROPIC_API_KEY
- MERCHANT_UPI_VPA
- MERCHANT_NAME
- CALL_ALLOWLIST
- DEMO_DEBTOR_PHONE
- BOLNA_COLLECTIONS_AGENT_ID
- BOLNA_BRIEF_AGENT_ID
- OWNER_PHONE
- BOLNA_TTS_VOICE
- BOLNA_TTS_VOICE_ID

## All canonical fields currently unset (including optional alternate providers)

- DATABASE_URL
- CALL_ALLOWLIST
- DEMO_DEBTOR_PHONE
- BUSINESS_NAME
- OWNER_NAME
- OWNER_PHONE
- MERCHANT_UPI_VPA
- MERCHANT_NAME
- BOLNA_FROM_NUMBER
- BOLNA_COLLECTIONS_AGENT_ID
- BOLNA_BRIEF_AGENT_ID
- BOLNA_TTS_VOICE
- BOLNA_TTS_VOICE_ID
- LLM_BASE_URL
- LLM_API_KEY
- ANTHROPIC_API_KEY
- LLM_FALLBACK_PROVIDER
- LLM_FALLBACK_MODEL
- META_WA_TOKEN
- META_WA_PHONE_NUMBER_ID
- META_WA_VERIFY_TOKEN
- META_WA_TEMPLATE_NAME
- TWILIO_ACCOUNT_SID
- TWILIO_AUTH_TOKEN
- TWILIO_WHATSAPP_FROM
- TWILIO_SMS_FROM
- RAZORPAY_KEY_ID
- RAZORPAY_KEY_SECRET
- RAZORPAY_WEBHOOK_SECRET

Defaulted settings count as configured; their values are documented in src/lib/env.ts. An unset optional provider credential does not block the selected provider. Security credentials are set. No secret values are included here.
