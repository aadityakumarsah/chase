import type { Metadata } from "next";
import { LandingPage } from "@/components/marketing/landing-page";

export const metadata: Metadata = {
  title: "Chase — Less chasing. More business.",
  robots: { index: true, follow: true },
  alternates: { canonical: "/" },
  description:
    "Turn unpaid invoices into thoughtful conversations, clear promises and payments. Voice-powered collections for Indian businesses. Backed by Sagarmatha Labs.",
  openGraph: {
    type: "website",
    locale: "en_IN",
    siteName: "Chase",
    title: "Chase — Less chasing. More business.",
    description:
      "Voice-powered receivables for Indian businesses. Bolna makes the call. Chase gets you paid.",
    url: "/",
  },
  twitter: {
    card: "summary_large_image",
    title: "Chase — Less chasing. More business.",
    description:
      "Voice-powered receivables for Indian businesses. Bolna makes the call. Chase gets you paid.",
  },
};

export default function HomePage() {
  return <LandingPage />;
}
