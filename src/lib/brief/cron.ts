import { matchesPasscode } from "@/lib/auth";

export function verifyCronAuthorization(
  authorization: string | null,
  secret: string | undefined,
) {
  if (!secret || !authorization?.startsWith("Bearer ")) return false;
  const presented = authorization.slice("Bearer ".length);
  return Boolean(presented) && matchesPasscode(presented, secret);
}
