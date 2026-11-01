import type { Metadata } from "next";
import { DocsSite } from "@/components/docs/docs-site";
import { productDocs } from "@/lib/product-docs";

export const metadata: Metadata = {
  title: "Documentation",
  description:
    "Learn how to use Chase for invoice follow-ups, voice calls, payment promises, compliance and daily briefs.",
  alternates: { canonical: "/docs" },
  robots: { index: true, follow: true },
};

export default function DocsPage() {
  // Keyed so navigating between guides remounts and restarts the scroll chain.
  return <DocsSite key={productDocs[0].slug} doc={productDocs[0]} />;
}
