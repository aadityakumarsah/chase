import type { Metadata } from "next";
import { LandingPage } from "@/components/marketing/landing-page";

export const metadata: Metadata = {
  title: "Chase — Less chasing. More business.",
  description:
    "Turn unpaid invoices into thoughtful conversations, clear promises and payments. Voice-powered collections for Indian businesses. Backed by Sagarmatha Labs.",
};

export default function HomePage() {
  return <LandingPage />;
}
