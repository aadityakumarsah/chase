import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { isPublicPath } from "@/lib/auth";
import { supabaseConfig } from "@/lib/supabase/config";

/**
 * Request interceptor (Next 16 names this file proxy.ts).
 *
 * Two jobs: refresh the Supabase session cookie so a signed-in user is not
 * logged out mid-session, and keep unauthenticated traffic out of the
 * workspace. Authorization proper — which workspace, which role — is decided
 * per request by `requireMember`, never here.
 */
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (isPublicPath(pathname)) return NextResponse.next();

  const config = supabaseConfig();
  if (!config) {
    // Authentication is not configured: fail closed rather than exposing data.
    if (pathname.startsWith("/api/"))
      return NextResponse.json(
        { error: "Authentication is not configured" },
        { status: 503 },
      );
    return NextResponse.redirect(
      new URL("/login?error=unconfigured", request.url),
    );
  }

  let response = NextResponse.next({ request });
  const supabase = createServerClient(config.url, config.publishableKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (list) => {
        for (const { name, value } of list) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of list)
          response.cookies.set(name, value, options);
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    if (pathname.startsWith("/api/"))
      return NextResponse.json({ error: "Sign in required" }, { status: 401 });
    const target = new URL("/login", request.url);
    if (pathname !== "/") target.searchParams.set("next", pathname);
    return NextResponse.redirect(target);
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
