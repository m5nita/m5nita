ALTER TABLE "payment" RENAME COLUMN "stripe_payment_intent_id" TO "external_payment_id";--> statement-breakpoint
ALTER TABLE "payment" RENAME CONSTRAINT "payment_stripe_payment_intent_id_unique" TO "payment_external_payment_id_unique";
