import { PageHeading } from "@/components/page-heading";
import { SettingsNav } from "@/components/dashboard/settings-nav";
import { BillingPage } from "@/components/dashboard/billing-page";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ checkout?: string }>;
}) {
  const { checkout } = await searchParams;
  return (
    <main className="space-y-6 p-5 lg:p-8">
      <PageHeading
        eyebrow="Workspace"
        title="Plan & billing"
        description="Your limits, what you have used this month, and how to change plan."
      />
      <SettingsNav />
      <BillingPage
        checkout={
          checkout === "done"
            ? "done"
            : checkout === "cancelled"
              ? "cancelled"
              : null
        }
      />
    </main>
  );
}
