import type { Metadata } from "next";
import "./globals.css";
import GradientWaves from "@/components/effects/GradientWaves";

export const metadata: Metadata = {
  title: "RecoverAI — AI-Governed Revenue Recovery",
  description: "AI-assisted revenue recovery with deterministic guardrails, verified settlement, escalation and auditability.",
  metadataBase: new URL("https://ai-revenue-recovery-flame.vercel.app"),
  openGraph: {
    title: "RecoverAI — AI-Governed Revenue Recovery",
    description: "AI-assisted revenue recovery with deterministic guardrails, verified settlement, escalation and auditability.",
    type: "website",
    images: [{ url: "/og-image.svg", width: 1200, height: 630, alt: "RecoverAI AI-governed revenue recovery" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "RecoverAI — AI-Governed Revenue Recovery",
    description: "AI-assisted revenue recovery with deterministic guardrails, verified settlement, escalation and auditability.",
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
