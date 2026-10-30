import { BriefPage } from "@/components/dashboard/brief-page";

export default async function DatedBriefPage(
  props: PageProps<"/brief/[date]">,
) {
  const { date } = await props.params;
  return <BriefPage date={date} />;
}
