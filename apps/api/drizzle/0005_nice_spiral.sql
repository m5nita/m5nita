ALTER TABLE "match" ALTER COLUMN "competition_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "pool" ALTER COLUMN "competition_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "competition" ADD COLUMN "featured" boolean DEFAULT false NOT NULL;