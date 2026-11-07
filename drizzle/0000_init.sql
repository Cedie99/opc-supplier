CREATE TABLE "audit_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" uuid NOT NULL,
	"supplier_id" uuid,
	"action" text NOT NULL,
	"actor_id" uuid,
	"actor_label" text,
	"note" text,
	"data" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "canvass_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"canvass_id" uuid NOT NULL,
	"supplier_id" uuid NOT NULL,
	"landed_cost" numeric(14, 4),
	"quotation_ref" text,
	"critical_spec_failed" boolean DEFAULT false NOT NULL,
	"inputs" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"total_score" numeric(5, 2),
	"classification" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "canvasses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reference" text NOT NULL,
	"title" text NOT NULL,
	"category_id" uuid,
	"material_description" text,
	"template_id" uuid NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"recommended_supplier_id" uuid,
	"recommendation" text,
	"decision_note" text,
	"created_by" uuid NOT NULL,
	"decided_by" uuid,
	"submitted_at" timestamp with time zone,
	"decided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "canvasses_reference_unique" UNIQUE("reference")
);
--> statement-breakpoint
CREATE TABLE "communication_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"supplier_id" uuid NOT NULL,
	"request_type" text NOT NULL,
	"subject" text NOT NULL,
	"requested_at" timestamp with time zone NOT NULL,
	"responded_at" timestamp with time zone,
	"logged_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "complaints" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"supplier_id" uuid NOT NULL,
	"description" text NOT NULL,
	"raised_on" date NOT NULL,
	"due_on" date NOT NULL,
	"resolved_on" date,
	"status" text DEFAULT 'open' NOT NULL,
	"resolution" text,
	"logged_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "corrective_actions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reference" text NOT NULL,
	"supplier_id" uuid NOT NULL,
	"evaluation_id" uuid,
	"criterion" text,
	"issue" text NOT NULL,
	"root_cause" text,
	"action_plan" text,
	"owner_id" uuid,
	"supplier_contact" text,
	"due_date" date NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"closure_note" text,
	"closed_at" timestamp with time zone,
	"closed_by" uuid,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "corrective_actions_reference_unique" UNIQUE("reference")
);
--> statement-breakpoint
CREATE TABLE "counters" (
	"key" text PRIMARY KEY NOT NULL,
	"value" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "document_types" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"is_mandatory" boolean DEFAULT false NOT NULL,
	"has_expiry" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "document_types_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "evaluations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"supplier_id" uuid NOT NULL,
	"template_id" uuid NOT NULL,
	"year" smallint NOT NULL,
	"quarter" smallint NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"inputs" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"total_score" numeric(5, 2),
	"classification" text,
	"comments" text,
	"decision_note" text,
	"evaluator_id" uuid,
	"approver_id" uuid,
	"submitted_at" timestamp with time zone,
	"approved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "material_categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"is_critical" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "material_categories_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "profiles" (
	"id" uuid PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"full_name" text NOT NULL,
	"role" text DEFAULT 'viewer' NOT NULL,
	"department" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "profiles_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "scoring_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"category_id" uuid,
	"name" text NOT NULL,
	"version" integer NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"criteria" jsonb NOT NULL,
	"bands" jsonb NOT NULL,
	"change_note" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "supplier_categories" (
	"supplier_id" uuid NOT NULL,
	"category_id" uuid NOT NULL,
	"materials" text,
	CONSTRAINT "supplier_categories_supplier_id_category_id_pk" PRIMARY KEY("supplier_id","category_id")
);
--> statement-breakpoint
CREATE TABLE "supplier_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"supplier_id" uuid NOT NULL,
	"document_type_id" uuid NOT NULL,
	"storage_path" text NOT NULL,
	"file_name" text NOT NULL,
	"file_size" integer,
	"mime_type" text,
	"issued_on" date,
	"expires_on" date,
	"status" text DEFAULT 'pending' NOT NULL,
	"review_note" text,
	"uploaded_by" uuid,
	"reviewed_by" uuid,
	"reviewed_at" timestamp with time zone,
	"is_current" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "supplier_invites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token" text NOT NULL,
	"supplier_id" uuid,
	"email" text,
	"company_name" text,
	"expires_at" timestamp with time zone NOT NULL,
	"submitted_at" timestamp with time zone,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "supplier_invites_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "suppliers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"trade_name" text,
	"contact_person" text,
	"email" text,
	"phone" text,
	"address" text,
	"tin" text,
	"website" text,
	"year_established" integer,
	"credit_terms_days" integer,
	"tier" text DEFAULT 'standard' NOT NULL,
	"status" text DEFAULT 'prospect' NOT NULL,
	"is_single_source" boolean DEFAULT false NOT NULL,
	"mold_ownership" text DEFAULT 'not_applicable' NOT NULL,
	"erp_vendor_code" text,
	"latest_score" numeric(5, 2),
	"latest_score_at" timestamp with time zone,
	"accredited_at" timestamp with time zone,
	"notes" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "suppliers_code_unique" UNIQUE("code")
);
--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_actor_id_profiles_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "canvass_entries" ADD CONSTRAINT "canvass_entries_canvass_id_canvasses_id_fk" FOREIGN KEY ("canvass_id") REFERENCES "public"."canvasses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "canvass_entries" ADD CONSTRAINT "canvass_entries_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "canvasses" ADD CONSTRAINT "canvasses_category_id_material_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."material_categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "canvasses" ADD CONSTRAINT "canvasses_template_id_scoring_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."scoring_templates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "canvasses" ADD CONSTRAINT "canvasses_recommended_supplier_id_suppliers_id_fk" FOREIGN KEY ("recommended_supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "canvasses" ADD CONSTRAINT "canvasses_created_by_profiles_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "canvasses" ADD CONSTRAINT "canvasses_decided_by_profiles_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "communication_logs" ADD CONSTRAINT "communication_logs_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "communication_logs" ADD CONSTRAINT "communication_logs_logged_by_profiles_id_fk" FOREIGN KEY ("logged_by") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "complaints" ADD CONSTRAINT "complaints_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "complaints" ADD CONSTRAINT "complaints_logged_by_profiles_id_fk" FOREIGN KEY ("logged_by") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "corrective_actions" ADD CONSTRAINT "corrective_actions_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "corrective_actions" ADD CONSTRAINT "corrective_actions_evaluation_id_evaluations_id_fk" FOREIGN KEY ("evaluation_id") REFERENCES "public"."evaluations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "corrective_actions" ADD CONSTRAINT "corrective_actions_owner_id_profiles_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "corrective_actions" ADD CONSTRAINT "corrective_actions_closed_by_profiles_id_fk" FOREIGN KEY ("closed_by") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "corrective_actions" ADD CONSTRAINT "corrective_actions_created_by_profiles_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evaluations" ADD CONSTRAINT "evaluations_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evaluations" ADD CONSTRAINT "evaluations_template_id_scoring_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."scoring_templates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evaluations" ADD CONSTRAINT "evaluations_evaluator_id_profiles_id_fk" FOREIGN KEY ("evaluator_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evaluations" ADD CONSTRAINT "evaluations_approver_id_profiles_id_fk" FOREIGN KEY ("approver_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scoring_templates" ADD CONSTRAINT "scoring_templates_category_id_material_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."material_categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scoring_templates" ADD CONSTRAINT "scoring_templates_created_by_profiles_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_categories" ADD CONSTRAINT "supplier_categories_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_categories" ADD CONSTRAINT "supplier_categories_category_id_material_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."material_categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_documents" ADD CONSTRAINT "supplier_documents_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_documents" ADD CONSTRAINT "supplier_documents_document_type_id_document_types_id_fk" FOREIGN KEY ("document_type_id") REFERENCES "public"."document_types"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_documents" ADD CONSTRAINT "supplier_documents_uploaded_by_profiles_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_documents" ADD CONSTRAINT "supplier_documents_reviewed_by_profiles_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_invites" ADD CONSTRAINT "supplier_invites_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_invites" ADD CONSTRAINT "supplier_invites_created_by_profiles_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_created_by_profiles_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_events_entity_type_entity_id_index" ON "audit_events" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "audit_events_supplier_id_index" ON "audit_events" USING btree ("supplier_id");--> statement-breakpoint
CREATE INDEX "audit_events_created_at_index" ON "audit_events" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "canvass_entries_canvass_id_supplier_id_index" ON "canvass_entries" USING btree ("canvass_id","supplier_id");--> statement-breakpoint
CREATE INDEX "canvasses_status_index" ON "canvasses" USING btree ("status");--> statement-breakpoint
CREATE INDEX "communication_logs_supplier_id_requested_at_index" ON "communication_logs" USING btree ("supplier_id","requested_at");--> statement-breakpoint
CREATE INDEX "complaints_supplier_id_due_on_index" ON "complaints" USING btree ("supplier_id","due_on");--> statement-breakpoint
CREATE INDEX "corrective_actions_supplier_id_index" ON "corrective_actions" USING btree ("supplier_id");--> statement-breakpoint
CREATE INDEX "corrective_actions_status_index" ON "corrective_actions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "corrective_actions_due_date_index" ON "corrective_actions" USING btree ("due_date");--> statement-breakpoint
CREATE UNIQUE INDEX "evaluations_supplier_id_year_quarter_index" ON "evaluations" USING btree ("supplier_id","year","quarter");--> statement-breakpoint
CREATE INDEX "evaluations_year_quarter_index" ON "evaluations" USING btree ("year","quarter");--> statement-breakpoint
CREATE INDEX "evaluations_status_index" ON "evaluations" USING btree ("status");--> statement-breakpoint
CREATE INDEX "scoring_templates_kind_is_active_index" ON "scoring_templates" USING btree ("kind","is_active");--> statement-breakpoint
CREATE INDEX "supplier_categories_category_id_index" ON "supplier_categories" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "supplier_documents_supplier_id_index" ON "supplier_documents" USING btree ("supplier_id");--> statement-breakpoint
CREATE INDEX "supplier_documents_expires_on_index" ON "supplier_documents" USING btree ("expires_on");--> statement-breakpoint
CREATE INDEX "supplier_documents_status_index" ON "supplier_documents" USING btree ("status");--> statement-breakpoint
CREATE INDEX "suppliers_status_index" ON "suppliers" USING btree ("status");--> statement-breakpoint
CREATE INDEX "suppliers_tier_index" ON "suppliers" USING btree ("tier");--> statement-breakpoint
CREATE INDEX "suppliers_name_idx" ON "suppliers" USING btree ("name");