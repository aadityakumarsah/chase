import { PageHeading } from "@/components/page-heading";
import { BillingPage } from "@/components/dashboard/billing-page";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ checkout?: string }>;
}) {
  const { checkout } = await searchParams;
  return (
    <div className="space-y-6 p-6">
      <PageHeading
        title="Plan and billing"
        description="See your workspace limits, upgrade, and manage your Dodo subscription."
      />
      <BillingPage
        checkout={
          checkout === "done"
            ? "done"
            : checkout === "cancelled"
              ? "cancelled"
              : null
        }
      />
    </div>
  );
}
