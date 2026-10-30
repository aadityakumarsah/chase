CREATE TABLE "sim_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"prompt_version_id" uuid,
	"prompt_hash" text NOT NULL,
	"personas" text[] NOT NULL,
	"report" jsonb NOT NULL,
	"passed" boolean NOT NULL,
	"model" text NOT NULL,
	"completed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "sim_runs" ADD CONSTRAINT "sim_runs_prompt_version_id_prompt_versions_id_fk" FOREIGN KEY ("prompt_version_id") REFERENCES "public"."prompt_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "sim_runs_prompt_completed_idx" ON "sim_runs" USING btree ("prompt_version_id","completed_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "sim_runs_completed_idx" ON "sim_runs" USING btree ("completed_at" DESC NULLS LAST);