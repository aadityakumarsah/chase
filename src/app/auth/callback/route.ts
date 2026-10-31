import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * OAuth and email-confirmation return path. Supabase sends the browser here with
 * a one-time code, which is exchanged server-side for the session cookies.
 */
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const requested = request.nextUrl.searchParams.get("next");
  // Only same-site paths: an attacker-supplied absolute URL must not be followed.
  const next =
    requested && requested.startsWith("/") && !requested.startsWith("//")
      ? requested
      : "/dashboard";

  if (!code)
    return NextResponse.redirect(
      new URL("/login?error=missing_code", request.url),
    );

  try {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error)
      return NextResponse.redirect(
        new URL("/login?error=exchange_failed", request.url),
      );
  } catch {
    return NextResponse.redirect(
      new URL("/login?error=unconfigured", request.url),
    );
  }
  return NextResponse.redirect(new URL(next, request.url));
}
