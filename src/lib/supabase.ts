import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = import.meta.env["VITE_SUPABASE_URL"] as string | undefined;
const anonKey = import.meta.env["VITE_SUPABASE_ANON_KEY"] as string | undefined;

export const supabaseConfigured = Boolean(url && anonKey && !url.includes("your-project"));
export const supabase: SupabaseClient | null =
  supabaseConfigured && url && anonKey
    ? createClient(url, anonKey, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
      })
    : null;

export async function ensureSupabaseSession() {
  if (!supabase) return null;
  const current = await supabase.auth.getSession();
  if (current.data.session?.user) return current.data.session.user;
  const created = await supabase.auth.signInAnonymously();
  if (created.error) throw created.error;
  return created.data.user;
}
