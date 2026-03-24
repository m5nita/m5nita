CREATE TABLE "prize_withdrawal" (
	"id" uuid PRIMARY KEY NOT NULL,
	"pool_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"payment_id" uuid NOT NULL,
	"amount" integer NOT NULL,
	"pix_key_type" text NOT NULL,
	"pix_key" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "prize_withdrawal" ADD CONSTRAINT "prize_withdrawal_pool_id_pool_id_fk" FOREIGN KEY ("pool_id") REFERENCES "public"."pool"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prize_withdrawal" ADD CONSTRAINT "prize_withdrawal_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prize_withdrawal" ADD CONSTRAINT "prize_withdrawal_payment_id_payment_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payment"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "prize_withdrawal_pool_user_idx" ON "prize_withdrawal" USING btree ("pool_id","user_id");--> statement-breakpoint
CREATE INDEX "prize_withdrawal_pool_id_idx" ON "prize_withdrawal" USING btree ("pool_id");