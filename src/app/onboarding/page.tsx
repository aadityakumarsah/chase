import { redirect } from "next/navigation";
import { OnboardingForm } from "@/components/auth/onboarding-form";
import { ChaseBrand } from "@/components/marketing/brand";
import styles from "@/components/marketing/marketing.module.css";
import { getAuthUser } from "@/lib/supabase/server";
import { ensureAppUser, listWorkspaces } from "@/lib/tenancy";

export const dynamic = "force-dynamic";

export default async function Onboarding() {
  const user = await getAuthUser().catch(() => null);
  if (!user) redirect("/login?next=/onboarding");
  await ensureAppUser(user);
  // Already in a workspace: nothing to set up.
  if ((await listWorkspaces(user.id)).length) redirect("/dashboard");

  return (
    <main className={`${styles.site} ${styles.onboard}`}>
      <div className={styles.onboardCard}>
        <ChaseBrand />
        <span className={styles.eyebrow}>ONE LAST STEP</span>
        <h1>Set up your workspace.</h1>
        <p>
          This takes a minute. You can change every one of these later in
          Settings.
        </p>
        <OnboardingForm defaultName={user.fullName ?? ""} />
      </div>
    </main>
  );
}
