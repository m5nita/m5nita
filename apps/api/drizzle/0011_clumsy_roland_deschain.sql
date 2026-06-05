ALTER TABLE "match" ADD COLUMN "extra_time_home_score" integer;--> statement-breakpoint
ALTER TABLE "match" ADD COLUMN "extra_time_away_score" integer;--> statement-breakpoint
ALTER TABLE "match" ADD COLUMN "penalty_home_score" integer;--> statement-breakpoint
ALTER TABLE "match" ADD COLUMN "penalty_away_score" integer;--> statement-breakpoint
ALTER TABLE "match" ADD COLUMN "winner" text;--> statement-breakpoint
ALTER TABLE "match" ADD COLUMN "duration" text;--> statement-breakpoint
ALTER TABLE "prediction" ADD COLUMN "advance_pick" text;