import { CallDetail } from "@/components/dashboard/call-detail";
export default async function CallPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return <CallDetail id={(await params).id} />;
}
