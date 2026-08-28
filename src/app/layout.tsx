import type { Metadata } from "next";
import "./globals.css";
import GradientWaves from "@/components/effects/GradientWaves";

export const metadata: Metadata = {
  title: "RecoverAI — Deterministic Revenue Recovery Platform",
  description: "RecoverAI is a deterministic closed-loop recovery prototype that detects revenue at risk, executes bounded interventions, and verifies recovered funds with auditable ledger proof. No live model call is made per case in this build.",
  metadataBase: new URL("https://ai-revenue-recovery-flame.vercel.app"),
  openGraph: {
    title: "RecoverAI — Deterministic Revenue Recovery",
    description: "Detect revenue risk. Diagnose the cause. Execute within guardrails. Verify the money with canonical settlement proof.",
    type: "website",
    images: [{ url: "/og-image.svg", width: 1200, height: 630, alt: "RecoverAI autonomous revenue recovery agent" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "RecoverAI — Deterministic Revenue Recovery",
    description: "Detect revenue risk. Diagnose the cause. Execute within guardrails. Verify the money with canonical settlement proof.",
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
