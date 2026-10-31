import type { MetadataRoute } from "next";

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
  ];
}
