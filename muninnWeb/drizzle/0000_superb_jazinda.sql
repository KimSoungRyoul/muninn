CREATE TABLE "incident_log" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"issue_name" text,
	"run_name" text,
	"app_id" text,
	"app_name" text,
	"issuing_user" text,
	"user_prompt" text,
	"goal" text,
	"recalled_memory_ids" text[],
	"status" text,
	"outcome" text,
	"summary" text,
	"cost" real,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "memory" (
	"id" text PRIMARY KEY NOT NULL,
	"scope" text NOT NULL,
	"app_id" text,
	"app_name" text,
	"fact" text NOT NULL,
	"tags" text[] DEFAULT '{}' NOT NULL,
	"score" real DEFAULT 0.5 NOT NULL,
	"curated" boolean DEFAULT false NOT NULL,
	"source_run_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "memory_history" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"memory_id" text NOT NULL,
	"prev_fact" text,
	"new_fact" text,
	"changed_by" text,
	"reason" text,
	"changed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "memory_fact_fts" ON "memory" USING gin (to_tsvector('simple', "fact"));--> statement-breakpoint
CREATE INDEX "memory_tags_idx" ON "memory" USING gin ("tags");--> statement-breakpoint
CREATE INDEX "memory_app_idx" ON "memory" USING btree ("app_id");