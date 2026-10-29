ALTER TABLE "llm_calls" ADD COLUMN "estimated_cost_usd" numeric(18, 9);--> statement-breakpoint
ALTER TABLE "llm_calls" ADD COLUMN "pricing_source" text;