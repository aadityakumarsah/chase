import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireSupabaseConfig } from "./config";

/**
 * Server-side Supabase client bound to the request's cookie jar so that token
 * refreshes are written back. Use inside server components, route handlers and
 * server actions.
 */
export async function createSupabaseServerClient(): Promise<SupabaseClient> {
  const { url, publishableKey } = requireSupabaseConfig();
  const store = await cookies();
  return createServerClient(url, publishableKey, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        try {
          for (const { name, value, options } of list)
            store.set(name, value, options);
        } catch {
          // Server components cannot set cookies; the proxy refreshes instead.
        }
      },
    },
  });
}

export type AuthUser = {
  id: string;
  email: string;
  fullName: string | null;
  avatarUrl: string | null;
};

/**
 * The verified signed-in user, or null. Uses getUser(), which revalidates the
 * token against Supabase; the decoded cookie alone is never trusted.
 */
export async function getAuthUser(): Promise<AuthUser | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user?.email) return null;
  const meta = data.user.user_metadata ?? {};
  const name =
    typeof meta.full_name === "string"
      ? meta.full_name
      : typeof meta.name === "string"
        ? meta.name
        : null;
  const avatar = typeof meta.avatar_url === "string" ? meta.avatar_url : null;
  return {
    id: data.user.id,
    email: data.user.email,
    fullName: name,
    avatarUrl: avatar,
  };
}
