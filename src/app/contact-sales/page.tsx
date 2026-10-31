import type { Metadata } from "next";
import { SalesContactPage } from "@/components/marketing/sales-contact-page";
export const metadata: Metadata = {
  title: "Contact sales",
  description: "Talk to Chase about an Enterprise receivables plan.",
  robots: { index: true, follow: true },
  alternates: { canonical: "/contact-sales" },
};
export default function Page() {
  return <SalesContactPage />;
}
