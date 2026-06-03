CREATE TABLE "participant_pool_stats" (
	"id" uuid PRIMARY KEY NOT NULL,
	"pool_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"finished_count" integer DEFAULT 0 NOT NULL,
	"exact_count" integer DEFAULT 0 NOT NULL,
	"result_count" integer DEFAULT 0 NOT NULL,
	"points_total" integer DEFAULT 0 NOT NULL,
	"home_correct" integer DEFAULT 0 NOT NULL,
	"home_total" integer DEFAULT 0 NOT NULL,
	"away_correct" integer DEFAULT 0 NOT NULL,
	"away_total" integer DEFAULT 0 NOT NULL,
	"low_goals_correct" integer DEFAULT 0 NOT NULL,
	"low_goals_total" integer DEFAULT 0 NOT NULL,
	"high_goals_correct" integer DEFAULT 0 NOT NULL,
	"high_goals_total" integer DEFAULT 0 NOT NULL,
	"last_position" integer,
	"prev_position" integer,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stats_unlock" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"pool_id" uuid NOT NULL,
	"payment_id" uuid NOT NULL,
	"unlocked_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "participant_pool_stats" ADD CONSTRAINT "participant_pool_stats_pool_id_pool_id_fk" FOREIGN KEY ("pool_id") REFERENCES "public"."pool"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "participant_pool_stats" ADD CONSTRAINT "participant_pool_stats_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stats_unlock" ADD CONSTRAINT "stats_unlock_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stats_unlock" ADD CONSTRAINT "stats_unlock_pool_id_pool_id_fk" FOREIGN KEY ("pool_id") REFERENCES "public"."pool"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stats_unlock" ADD CONSTRAINT "stats_unlock_payment_id_payment_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payment"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "participant_pool_stats_pool_id_user_id_idx" ON "participant_pool_stats" USING btree ("pool_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "stats_unlock_user_id_pool_id_idx" ON "stats_unlock" USING btree ("user_id","pool_id");