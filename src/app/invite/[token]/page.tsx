import Link from "next/link";
import { redirect } from "next/navigation";
import { ChaseBrand } from "@/components/marketing/brand";
import styles from "@/components/marketing/marketing.module.css";
import { getAuthUser } from "@/lib/supabase/server";
import { ensureAppUser } from "@/lib/tenancy";
import { acceptInvite } from "@/lib/tenancy/team";

export const dynamic = "force-dynamic";

const MESSAGES: Record<string, string> = {
  invalid: "This invitation link is not valid.",
  used: "This invitation has already been used.",
  expired: "This invitation has expired. Ask for a new one.",
  wrong_account:
    "This invitation was sent to a different email address. Sign in with that address to accept it.",
  plan_limit:
    "This workspace has reached its team member limit. Ask the owner to upgrade its plan.",
};

export default async function AcceptInvite({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const user = await getAuthUser().catch(() => null);
  // Signing in first is required: an invitation is bound to its email address.
  if (!user) redirect(`/login?next=${encodeURIComponent(`/invite/${token}`)}`);
  await ensureAppUser(user);

  const result = await acceptInvite(token, user);
  if (result.ok) redirect("/dashboard");

  return (
    <main className={`${styles.site} ${styles.onboard}`}>
      <div className={styles.onboardCard}>
        <ChaseBrand />
        <h1>Invitation unavailable</h1>
        <p>{MESSAGES[result.reason] ?? MESSAGES.invalid}</p>
        <p style={{ marginTop: 24 }}>
          <Link href="/dashboard">Go to your workspace</Link>
        </p>
      </div>
    </main>
  );
}
