import type { MetadataRoute } from "next";
import { productDocs } from "@/lib/product-docs";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: "https://chase-liard.vercel.app/",
      changeFrequency: "weekly",
      priority: 1,
    },
    {
      url: "https://chase-liard.vercel.app/pricing",
      changeFrequency: "monthly",
      priority: 0.8,
    },
    {
      url: "https://chase-liard.vercel.app/contact-sales",
      changeFrequency: "monthly",
      priority: 0.5,
    },
    ...productDocs.map((doc) => ({
      url: `https://chase-liard.vercel.app/docs${doc.slug === "overview" ? "" : `/${doc.slug}`}`,
      changeFrequency: "monthly" as const,
      priority: doc.slug === "overview" ? 0.8 : 0.6,
    })),
  ];
}
