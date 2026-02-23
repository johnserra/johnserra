import { createClient } from "@supabase/supabase-js";

// Browser / server component client (uses anon key, respects RLS).
// Lazy singleton — created on first call so placeholder env vars
// don't blow up at build time.
let _client: ReturnType<typeof createClient> | null = null;

export function getSupabaseClient() {
  if (!_client) {
    _client = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
  }
  return _client;
}

// Server-only admin client (uses service role key, bypasses RLS).
// Import only in API routes / server actions — never ship to the browser.
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}
