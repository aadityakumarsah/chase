import type { Metadata } from "next";
import "@fontsource-variable/inter";
import "@fontsource-variable/noto-sans-devanagari";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/theme-provider";
import "./globals.css";
export const metadata: Metadata = {
  metadataBase: new URL("https://chase-liard.vercel.app"),
  title: {
    default: "Chase | Voice-powered receivables for Indian businesses",
    template: "%s | Chase",
  },
  description:
    "Bolna makes the call. Chase gets you paid. Explainable follow-up, respectful AI voice calls and payment promises for Indian businesses.",
  applicationName: "Chase",
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
  },
  robots: { index: false, follow: false },
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="font-sans antialiased">
        <ThemeProvider>
          <TooltipProvider>
            {children}
            <Toaster />
          </TooltipProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
