import { NextRequest, NextResponse } from "next/server";
import { getEnv } from "@/lib/env";
import { ACTIVE_WORKSPACE_COOKIE } from "@/lib/tenancy";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  // Same-origin only: a cross-site form must not be able to sign a user out.
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(getEnv().APP_BASE_URL).origin)
    return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
  try {
    const supabase = await createSupabaseServerClient();
    await supabase.auth.signOut();
  } catch {
    // Already signed out or unconfigured; clearing cookies is still correct.
  }
  const response = NextResponse.redirect(new URL("/login", request.url), 303);
  response.cookies.set(ACTIVE_WORKSPACE_COOKIE, "", { path: "/", maxAge: 0 });
  return response;
}
