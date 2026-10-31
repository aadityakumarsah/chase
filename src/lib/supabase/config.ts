import { getEnv } from "@/lib/env";

export type SupabaseConfig = {
  url: string;
  publishableKey: string;
  secretKey?: string;
};

/**
 * Supabase is optional at build time so that `next build`, unit tests and the
 * public marketing page never require credentials. Anything that needs a signed
 * in user calls `requireSupabaseConfig()` and fails loudly instead.
 */
export function supabaseConfig(): SupabaseConfig | null {
  const env = getEnv();
  if (
    !env.NEXT_PUBLIC_SUPABASE_URL ||
    !env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  )
    return null;
  return {
    url: env.NEXT_PUBLIC_SUPABASE_URL,
    publishableKey: env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    secretKey: env.SUPABASE_SECRET_KEY,
  };
}

export function requireSupabaseConfig(): SupabaseConfig {
  const config = supabaseConfig();
  if (!config)
    throw new Error(
      "Authentication is not configured: set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    );
  return config;
}

export function isAuthConfigured(): boolean {
  return supabaseConfig() !== null;
}
