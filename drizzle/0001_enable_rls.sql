-- Supabase exposes every table in the public schema through its REST API.
-- The app reads and writes only from the server (Drizzle, as the database owner, which bypasses RLS),
-- so we enable Row Level Security with NO policies: the anon and authenticated API roles get no access at all.
ALTER TABLE "profiles" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "material_categories" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "document_types" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "suppliers" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "supplier_categories" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "supplier_documents" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "supplier_invites" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "scoring_templates" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "canvasses" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "canvass_entries" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "evaluations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "corrective_actions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "communication_logs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "complaints" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "audit_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "counters" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
-- Each profile belongs to a Supabase Auth user; deleting the auth user deletes the profile.
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_id_auth_users_fk" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;
