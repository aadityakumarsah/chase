import { z } from "zod";
import { supabaseConfig } from "./config";

const settingsSchema = z.object({
  external: z.object({ google: z.boolean().optional() }).optional(),
});

/** Show OAuth only when Supabase says the provider is actually enabled. */
export async function googleSignInAvailable(): Promise<boolean> {
  const config = supabaseConfig();
  if (!config) return false;
  try {
    const response = await fetch(new URL("/auth/v1/settings", config.url), {
      headers: { apikey: config.publishableKey },
      signal: AbortSignal.timeout(5_000),
      next: { revalidate: 300 },
    });
    if (!response.ok) return false;
    const parsed = settingsSchema.safeParse(await response.json());
    return parsed.success && parsed.data.external?.google === true;
  } catch {
    return false;
  }
}
