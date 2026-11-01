import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DocsSite } from "@/components/docs/docs-site";
import { findProductDoc, productDocs } from "@/lib/product-docs";

type Props = { params: Promise<{ slug: string }> };

export function generateStaticParams() {
  return productDocs.slice(1).map((doc) => ({ slug: doc.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const doc = findProductDoc(slug);
  if (!doc) return {};
  return {
    title: `${doc.title} · Documentation`,
    description: doc.description,
    alternates: { canonical: `/docs/${slug}` },
    robots: { index: true, follow: true },
  };
}

export default async function DocDetailPage({ params }: Props) {
  const { slug } = await params;
  const doc = findProductDoc(slug);
  if (!doc || slug === "overview") notFound();
  // Keyed so navigating between guides remounts and restarts the scroll chain.
  return <DocsSite key={doc.slug} doc={doc} />;
}
