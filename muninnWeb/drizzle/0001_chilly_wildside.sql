ALTER TABLE "memory" ADD COLUMN "workspace" text DEFAULT 'default' NOT NULL;--> statement-breakpoint
CREATE INDEX "memory_workspace_idx" ON "memory" USING btree ("workspace");