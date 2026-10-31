import type { MetadataRoute } from "next";

const origin = "https://chase-liard.vercel.app";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/api/",
        "/auth/",
        "/dashboard",
        "/debtors",
        "/calls",
        "/settings",
        "/onboarding",
        "/login",
        "/signup",
        "/invite/",
        "/pay/",
        "/stage",
      ],
    },
    sitemap: `${origin}/sitemap.xml`,
  };
}
