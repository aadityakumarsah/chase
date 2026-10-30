CREATE TABLE "proxy_call_states" (
	"call_id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"pending_supervisor_note" text,
	"slow_turn_streak" integer DEFAULT 0 NOT NULL,
	"supervisor_disabled" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
ALTER TABLE "call_turns" ADD COLUMN "time_to_first_token_ms" integer;--> statement-breakpoint
ALTER TABLE "proxy_call_states" ADD CONSTRAINT "proxy_call_states_call_id_calls_id_fk" FOREIGN KEY ("call_id") REFERENCES "public"."calls"("id") ON DELETE no action ON UPDATE no action;