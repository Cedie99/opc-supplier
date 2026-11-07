/** True when the Supabase keys are present. Until then the app shows a setup notice instead of crashing. */
export function isSupabaseConfigured() {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

export function appUrl() {
  return (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
}

export function documentsBucket() {
  return process.env.SUPABASE_DOCUMENTS_BUCKET ?? "supplier-documents";
}
