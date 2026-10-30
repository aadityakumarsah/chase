import { type NextRequest } from "next/server";
import { verifySession } from "@/lib/auth";
import { getEnv } from "@/lib/env";
export function labAuthStatus(request: NextRequest, mutation = false) {
  const env = getEnv();
  if (!verifySession(request.cookies.get("admin")?.value, env.ADMIN_PASSCODE))
    return 401;
  if (
    mutation &&
    request.headers.get("origin") !== new URL(env.APP_BASE_URL).origin
  )
    return 403;
  return 200;
}
