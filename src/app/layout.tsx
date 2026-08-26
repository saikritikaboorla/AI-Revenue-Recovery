import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import GradientWaves from "@/components/effects/GradientWaves";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "RecoverAI — AI Revenue Recovery Platform | Razorpay AI Buildathon",
  description: "Autonomous closed-loop agent platform detecting revenue at risk, executing bounded interventions, and recovering lost funds with mathematical explainability.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased text-[#F5F7FA] min-h-screen`}
      >
        <GradientWaves />
        <div className="app-chrome">{children}</div>
      </body>
    </html>
  );
}
