import { DebtorDetail } from "@/components/dashboard/debtor-detail";
export default async function DebtorPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return <DebtorDetail id={(await params).id} />;
}
