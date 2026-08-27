import type { Metadata } from "next";
import "./globals.css";
import GradientWaves from "@/components/effects/GradientWaves";

export const metadata: Metadata = {
  title: "RecoverAI — AI Revenue Recovery Platform | Razorpay AI Buildathon",
  description: "Autonomous closed-loop agent platform detecting revenue at risk, executing bounded interventions, and recovering lost funds with mathematical explainability.",
  metadataBase: new URL("https://ai-revenue-recovery-flame.vercel.app"),
  openGraph: {
    title: "RecoverAI — Autonomous Revenue Recovery",
    description: "Detect revenue risk. Diagnose the cause. Execute within guardrails. Verify the money.",
    type: "website",
    images: [{ url: "/og-image.svg", width: 1200, height: 630, alt: "RecoverAI autonomous revenue recovery agent" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "RecoverAI — Autonomous Revenue Recovery",
    description: "Detect revenue risk. Diagnose the cause. Execute within guardrails. Verify the money.",
    images: ["/og-image.svg"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body
        className="antialiased text-[#F5F7FA] min-h-screen"
      >
        <GradientWaves />
        <div className="app-chrome">{children}</div>
      </body>
    </html>
  );
}
