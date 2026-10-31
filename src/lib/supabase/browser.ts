"use client";
import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null = null;

/**
 * Browser Supabase client. Only the publishable key is ever shipped to the
 * browser; it can do nothing except authenticate, because every application
 * table denies the PostgREST roles.
 */
export function supabaseBrowser(): SupabaseClient {
  if (client) return client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key)
    throw new Error("Authentication is not configured in this deployment");
  client = createBrowserClient(url, key);
  return client;
}
