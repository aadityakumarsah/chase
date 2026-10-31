import { NextRequest, NextResponse } from "next/server";
import { getEnv } from "@/lib/env";
import { isPublicPath, verifySession } from "@/lib/auth";
export function proxy(request: NextRequest) {
  if (isPublicPath(request.nextUrl.pathname)) return NextResponse.next();
  const { ADMIN_PASSCODE, DEMO_VIEW_PASSCODE } = getEnv();
  if (
    verifySession(request.cookies.get("admin")?.value, ADMIN_PASSCODE) ||
    verifySession(request.cookies.get("demo_view")?.value, DEMO_VIEW_PASSCODE)
  )
    return NextResponse.next();
  if (request.nextUrl.pathname.startsWith("/api/"))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.redirect(new URL("/login", request.url));
}
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
