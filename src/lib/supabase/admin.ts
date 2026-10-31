import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { requireSupabaseConfig } from "./config";

/**
 * Admin client backed by the secret key. Server-only, used for operations the
 * user's own session may not perform: looking a user up by email when accepting
 * an invitation, and sending transactional auth mail.
 */
export function supabaseAdmin(): SupabaseClient {
  const { url, secretKey } = requireSupabaseConfig();
  if (!secretKey)
    throw new Error("SUPABASE_SECRET_KEY is required for this operation");
  return createClient(url, secretKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
