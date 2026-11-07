ALTER TABLE "supplier_invites" ADD COLUMN "purpose" text DEFAULT 'registration' NOT NULL;--> statement-breakpoint
ALTER TABLE "supplier_invites" ADD COLUMN "document_type_ids" jsonb;