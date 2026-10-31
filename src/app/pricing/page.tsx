import type { Metadata } from "next";
import { PricingPage } from "@/components/marketing/pricing-page";
export const metadata: Metadata = {
  title: "Pricing",
  description:
    "Chase plans for Indian businesses: free, Pro monthly or yearly, and Enterprise.",
  robots: { index: true, follow: true },
  alternates: { canonical: "/pricing" },
};
export default function Page() {
  return <PricingPage />;
}
