import { PromptPrDetailPage } from "@/components/dashboard/prompt-pr-detail";

export default async function Page(props: PageProps<"/prompt-prs/[id]">) {
  return <PromptPrDetailPage id={(await props.params).id} />;
}
