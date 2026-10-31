import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/auth";
import { getEnv } from "@/lib/env";

export function requireDashboardAdmin(
  request: NextRequest,
  options: { mutation?: boolean } = {},
) {
  const env = getEnv();
  const admin = verifySession(
    request.cookies.get("admin")?.value,
    env.ADMIN_PASSCODE,
  );
  const viewer = verifySession(
    request.cookies.get("demo_view")?.value,
    env.DEMO_VIEW_PASSCODE,
  );
  if (!admin && !viewer)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (options.mutation && !admin)
    return NextResponse.json(
      { error: "Read-only demo access" },
      { status: 403 },
    );
  if (
    options.mutation &&
    request.headers.get("origin") !== new URL(env.APP_BASE_URL).origin
  )
    return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
  return null;
}
