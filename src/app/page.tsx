"use client";

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { Navbar } from '@/components/Navbar';
import { LoadingScreen } from '@/components/LoadingScreen';
import { fetchWithTimeout } from '@/lib/fetch-with-timeout';
import {
  Zap,
  Activity,
  ArrowRight,
  PlayCircle,
  AlertTriangle,
  CheckCircle2,
  TrendingUp,
  Users,
  ChevronRight,
  Shield,
  BarChart3,
  RefreshCw,
  MessageSquare,
  Clock,
  FileText,
  CreditCard,
  ShoppingCart,
} from 'lucide-react';


// ── Types ────────────────────────────────────────────────────────────────────
interface Metrics {
  totalRevenueAtRisk?: number;
  totalRevenueRecovered?: number;
  overallRecoveryRate?: number;
  totalCasesCount?: number;
}

// ── Pipeline steps ───────────────────────────────────────────────────────────
const PIPELINE_STEPS = [
  { label: 'Detect',          desc: 'Webhook ingestion of failures & overdue events in real time.' },
  { label: 'Diagnose',        desc: 'Deep contextual reasoning: LTV, error codes, banking latency.' },
  { label: 'Risk Score',      desc: 'Probabilistic recovery score with confidence intervals.' },
  { label: 'Select Playbook', desc: 'Maps failure signature to the optimal recovery strategy.' },
  { label: 'Guardrail Check', desc: 'Max-retry, cooldown, contact-cap and value-threshold gates.' },
  { label: 'Execute Action',  desc: 'WhatsApp link, gateway failover, IVR, or NACH reschedule.' },
  { label: 'Verify',          desc: 'Razorpay webhook confirms successful settlement.' },
  { label: 'Write Ledger',    desc: 'Immutable append-only event written to recovery ledger.' },
  { label: 'Measure Recovery',desc: 'Win-rate, recovered value and automated attribution updated.' },
];

// ── Playbooks ────────────────────────────────────────────────────────────────
const PLAYBOOKS = [
  {
    num: '01',
    icon: CreditCard,
    accent: 'blue',
    title: 'Payment Degradation',
    desc: 'Dynamic gateway failover via Razorpay Optimizer when issuing banks or UPI switches degrade. Zero customer friction.',
  },
  {
    num: '02',
    icon: ShoppingCart,
    accent: 'cyan',
    title: 'Checkout Abandonment',
    desc: '1-click WhatsApp cart resumption with pre-filled UPI intent links. Recaptures high-intent D2C dropouts instantly.',
  },
  {
    num: '03',
    icon: RefreshCw,
    accent: 'purple',
    title: 'Failed Subscriptions',
    desc: 'RBI e-mandate re-authentication (₹15k cap) via 1-tap approval links with automated grace-period management.',
  },
  {
    num: '04',
    icon: FileText,
    accent: 'amber',
    title: 'B2B Overdue Receivables',
    desc: 'Net-30 invoice recovery with a 5% early settlement incentive and human-ops escalation when value thresholds are breached.',
  },
  {
    num: '05',
    icon: Clock,
    accent: 'indigo',
    title: 'Mandate Retry',
    desc: 'Smart rescheduling targeting the 06:00 AM IST morning clearing window aligned to salary-credit cycles.',
  },
  {
    num: '06',
    icon: MessageSquare,
    accent: 'pink',
    title: 'Hinglish Recovery',
    desc: 'Bilingual conversational WhatsApp outreach crafted for Indian D2C and retail segments to maximise open rates.',
  },
  {
    num: '07',
    icon: Shield,
    accent: 'teal',
    title: 'Promise-to-Pay Tracker',
    desc: 'Formalises settlement commitments with milestone tracking. Auto-escalates to legal ops on breach.',
  },
];

// ── Accent colour maps ────────────────────────────────────────────────────────
const ACCENT_BORDER: Record<string, string> = {
  blue:   'border-blue-500/40 group-hover:border-blue-400/70',
  cyan:   'border-cyan-500/40 group-hover:border-cyan-400/70',
  purple: 'border-purple-500/40 group-hover:border-purple-400/70',
  amber:  'border-amber-500/40 group-hover:border-amber-400/70',
  indigo: 'border-indigo-500/40 group-hover:border-indigo-400/70',
  pink:   'border-pink-500/40 group-hover:border-pink-400/70',
  teal:   'border-teal-500/40 group-hover:border-teal-400/70',
};
const ACCENT_ICON_BG: Record<string, string> = {
  blue:   'bg-blue-500/10 border-blue-500/30 text-blue-400',
  cyan:   'bg-cyan-500/10 border-cyan-500/30 text-cyan-400',
  purple: 'bg-purple-500/10 border-purple-500/30 text-purple-400',
  amber:  'bg-amber-500/10 border-amber-500/30 text-amber-400',
  indigo: 'bg-indigo-500/10 border-indigo-500/30 text-indigo-400',
  pink:   'bg-pink-500/10 border-pink-500/30 text-pink-400',
  teal:   'bg-teal-500/10 border-teal-500/30 text-teal-400',
};
const ACCENT_NUM: Record<string, string> = {
  blue:   'text-blue-500',
  cyan:   'text-cyan-500',
  purple: 'text-purple-500',
  amber:  'text-amber-500',
  indigo: 'text-indigo-500',
  pink:   'text-pink-500',
  teal:   'text-teal-500',
};

// ── Metric skeleton ──────────────────────────────────────────────────────────
function MetricSkeleton() {
  return (
    <div className="rounded-xl border border-[#1E2A3A] bg-[#0D1320]/80 p-5 animate-pulse">
      <div className="h-3 w-24 rounded bg-[#1E2A3A] mb-3" />
      <div className="h-7 w-32 rounded bg-[#1E2A3A] mb-2" />
      <div className="h-2.5 w-20 rounded bg-[#1E2A3A]" />
    </div>
  );
}

// ── Main page ────────────────────────────────────────────────────────────────
export default function LandingPage() {
  const [loading, setLoading]   = useState(true);
  const [metrics, setMetrics]   = useState<Metrics | null>(null);
  const [metricsFetching, setMetricsFetching] = useState(true);

  // Reveal after the shell has hydrated; the screen is an initialization cue, not a gate.
  useEffect(() => {
    const t = setTimeout(() => setLoading(false), 1300);
    return () => clearTimeout(t);
  }, []);

  // Fetch live metrics
  useEffect(() => {
    fetchWithTimeout('/api/metrics', {}, 10000)
      .then(res => res.json())
      .then((data: Metrics) => {
        setMetrics(data);
        setMetricsFetching(false);
      })
      .catch(() => setMetricsFetching(false));
  }, []);

  const metricCards = [
    {
      label: 'Revenue at Risk',
      value: metrics
        ? `₹${(metrics.totalRevenueAtRisk ?? 0).toLocaleString('en-IN')}`
        : null,
      sub:   'Live across 7 playbooks',
      valueColor: 'text-amber-400',
      borderGlow: 'border-amber-500/30 shadow-[0_0_18px_rgba(245,158,11,0.1)]',
      Icon: AlertTriangle,
      iconCls: 'text-amber-400',
    },
    {
      label: 'Verified Recovered',
      value: metrics
        ? `₹${(metrics.totalRevenueRecovered ?? 0).toLocaleString('en-IN')}`
        : null,
      sub:   'Written to Recovery Ledger',
      valueColor: 'text-emerald-400',
      borderGlow: 'border-emerald-500/30 shadow-[0_0_18px_rgba(34,197,94,0.1)]',
      Icon: CheckCircle2,
      iconCls: 'text-emerald-400',
    },
    {
      label: 'Recovery Win Rate',
      value: metrics
        ? `${metrics.overallRecoveryRate ?? 0}%`
        : null,
      sub:   'Verified settlements only',
      valueColor: 'text-blue-400',
      borderGlow: 'border-blue-500/30 shadow-[0_0_18px_rgba(59,130,246,0.1)]',
      Icon: TrendingUp,
      iconCls: 'text-blue-400',
    },
    {
      label: 'Active Cases',
      value: metrics
        ? String(metrics.totalCasesCount ?? 0)
        : null,
      sub:   'Immutable audit trail',
      valueColor: 'text-cyan-400',
      borderGlow: 'border-cyan-500/30 shadow-[0_0_18px_rgba(34,211,238,0.1)]',
      Icon: Users,
      iconCls: 'text-cyan-400',
    },
  ];

  return (
    <>
      {/* ── Loading screen ─────────────────────────────────────────────────── */}
      <LoadingScreen loading={loading} />

      <div className="min-h-screen bg-[#070A10]/72 text-[#F0F4FF] selection:bg-blue-500 selection:text-white relative overflow-x-hidden">

        {/* ── Ambient radial glow behind hero ─────────────────────────────── */}
        <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
          <div className="absolute top-[-10%] left-1/2 -translate-x-1/2 w-[900px] h-[500px] rounded-full bg-blue-700/8 blur-[140px]" />
        </div>

        <Navbar />

        {/* ════════════════════════════════════════════════════════════════════
            HERO
        ════════════════════════════════════════════════════════════════════ */}
        <section className="relative pt-24 pb-20 md:pt-36 md:pb-28 px-4 sm:px-6 lg:px-8 text-center max-w-6xl mx-auto">

          {/* Precision Badge */}
          <div className="inline-flex items-center gap-2.5 px-4 py-2 rounded-full bg-blue-500/10 border border-blue-500/30 text-blue-300 text-[11px] sm:text-xs font-semibold tracking-[0.12em] uppercase mb-12 sm:mb-16 shadow-[0_0_25px_rgba(59,130,246,0.18)] backdrop-blur-md">
            <Zap className="h-4 w-4 text-blue-400 shrink-0" />
            AI-Governed Closed-Loop Revenue Recovery Engine
          </div>

          {/* Large Bold Hero Headline */}
          <h1 className="mx-auto max-w-5xl text-4xl sm:text-6xl md:text-7xl font-extrabold tracking-[-0.035em] text-white leading-[1.06] mb-9 sm:mb-11">
            REVENUE IS SLIPPING. <br className="hidden sm:block" />
            <span className="bg-gradient-to-r from-blue-400 via-teal-300 to-indigo-400 bg-clip-text text-transparent">
              THE ENGINE FINDS IT.
            </span>
          </h1>

          {/* Separate text blocks keep the product proposition editorial and readable. */}
          <p className="text-base sm:text-lg md:text-xl text-[#D7E2F2] font-normal max-w-3xl mx-auto leading-[1.8] tracking-[0.01em] mb-5">
            Detect revenue risk. Diagnose the cause. Choose the right recovery playbook. Execute within guardrails. Verify the money.
          </p>

          {/* Supporting Trust Line */}
          <p className="text-sm sm:text-base text-[#93A7C3] font-medium max-w-2xl mx-auto leading-[1.75] tracking-[0.015em] mb-12 sm:mb-14">
            Every recovery is measured and recorded in an auditable ledger. The runtime decisioning remains deterministic in this build.
          </p>

          {/* CTAs with 3D Depth */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-20">
            <Link
              href="/dashboard"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-3 px-9 py-4 rounded-xl bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 text-white font-bold text-base sm:text-lg transition-all shadow-[0_10px_30px_rgba(37,99,235,0.4)] hover:shadow-[0_15px_40px_rgba(37,99,235,0.6)] hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-blue-400"
            >
              <Activity className="h-5 w-5 shrink-0" />
              LAUNCH COMMAND CENTER
              <ArrowRight className="h-5 w-5 shrink-0" />
            </Link>

            <Link
              href="/dashboard#simulation"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2.5 px-8 py-4 rounded-xl border border-[#253347] bg-[#0E1524]/80 hover:bg-[#152035] hover:border-blue-500/40 text-[#E2EAF8] font-semibold text-base sm:text-lg transition-all backdrop-blur-md hover:-translate-y-0.5 shadow-lg"
            >
              <PlayCircle className="h-5 w-5 shrink-0 text-teal-400" />
              RUN BATCH SIMULATOR
            </Link>
          </div>

          {/* 3D Visual Pipeline Container */}
          <div className="relative rounded-3xl border border-blue-500/20 bg-gradient-to-b from-[#0F172A]/90 to-[#070A12]/90 p-6 sm:p-8 backdrop-blur-xl shadow-[0_25px_60px_rgba(0,0,0,0.7),0_0_40px_rgba(59,130,246,0.15)] mb-16 text-left">
            <div className="flex items-center justify-between border-b border-[#1E2A3A] pb-4 mb-6">
              <div className="flex items-center gap-2.5">
                <div className="h-3 w-3 rounded-full bg-teal-400 shadow-[0_0_10px_#2DD4BF] animate-pulse" />
                <span className="text-xs sm:text-sm font-mono uppercase tracking-widest text-[#94A3B8]">
                  Closed-Loop Autonomous Architecture
                </span>
              </div>
              <span className="text-xs font-mono px-2.5 py-1 rounded-md bg-teal-950/60 border border-teal-500/30 text-teal-300">
                Guardrail Enforced
              </span>
            </div>

            {/* 5-Node Visual Flow */}
            <div className="grid grid-cols-1 sm:grid-cols-5 gap-3 relative">
              {[
                { step: '01', title: 'Revenue At Risk', desc: 'Webhook catches dropoffs & bank declines', color: 'border-amber-500/30 bg-amber-500/5 text-amber-400' },
                { step: '02', title: 'Automated Detection', desc: 'Deterministic context analysis of root failure code & risk factor', color: 'border-blue-500/30 bg-blue-500/5 text-blue-400' },
                { step: '03', title: 'Recovery Decision', desc: 'Selects optimal bounded playbook & rails', color: 'border-purple-500/30 bg-purple-500/5 text-purple-400' },
                { step: '04', title: 'Recovery Action', desc: 'Dispatches a bounded gateway or customer outreach action', color: 'border-cyan-500/30 bg-cyan-500/5 text-cyan-400' },
                { step: '05', title: 'Verified Revenue', desc: 'Verified settlement written to ledger', color: 'border-emerald-500/30 bg-emerald-500/5 text-emerald-400' },
              ].map((node, idx) => (
                <div
                  key={node.step}
                  className={`rounded-2xl border ${node.color} p-4 sm:p-5 flex flex-col justify-between transition-all hover:-translate-y-1 hover:shadow-lg backdrop-blur-md`}
                >
                  <div>
                    <span className="text-[11px] font-mono font-bold tracking-widest opacity-80 mb-2 block">
                      STAGE {node.step}
                    </span>
                    <h4 className="text-base sm:text-lg font-bold text-[#F1F5F9] mb-1 leading-snug">
                      {node.title}
                    </h4>
                  </div>
                  <p className="text-xs sm:text-sm text-[#8EA2C6] leading-relaxed mt-2">
                    {node.desc}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* ── Live Metric Cards ──────────────────────────────────────────── */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 max-w-5xl mx-auto text-left">
            {metricsFetching
              ? Array.from({ length: 4 }).map((_, i) => <MetricSkeleton key={i} />)
              : metricCards.map((m) => {
                  const Icon = m.Icon;
                  return (
                    <div
                      key={m.label}
                      className={`rounded-2xl border ${m.borderGlow} bg-[#0E1524]/90 p-5 sm:p-6 backdrop-blur-md transition-all hover:-translate-y-1 hover:shadow-xl`}
                    >
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-xs sm:text-sm font-semibold uppercase tracking-wider text-[#8FA3C7]">
                          {m.label}
                        </span>
                        <Icon className={`h-5 w-5 ${m.iconCls} opacity-90`} />
                      </div>
                      <p className={`text-2xl sm:text-3xl font-extrabold tracking-tight ${m.valueColor}`}>
                        {m.value ?? '—'}
                      </p>
                      <p className="text-xs sm:text-sm text-[#627D9E] mt-1.5 font-medium">{m.sub}</p>
                    </div>
                  );
                })}
          </div>
        </section>

        {/* ════════════════════════════════════════════════════════════════════
            PIPELINE
        ════════════════════════════════════════════════════════════════════ */}
        <section className="py-20 border-t border-[#1E2A3A] bg-[#080B14]/75 backdrop-blur-sm">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">

            {/* Section header */}
            <div className="text-center max-w-3xl mx-auto mb-14">
              <p className="text-xs font-bold uppercase tracking-widest text-blue-400 mb-3">
                Autonomous Pipeline
              </p>
              <h2 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-[#F0F4FF] tracking-tight mb-4">
                Detect → Diagnose → Decide → Act → Verify
              </h2>
              <p className="text-base text-[#6B7FA3] leading-relaxed">
                A stateful revenue-operations engine. Every stage is immutably logged with
                mathematical auditability and guardrails at each transition.
              </p>
            </div>

            {/* Steps: horizontal scroll on mobile, wrapping grid on larger screens */}
            <div className="flex flex-wrap items-start justify-center gap-3">
              {PIPELINE_STEPS.map((step, i) => (
                <React.Fragment key={step.label}>
                  {/* Step card */}
                  <div className="flex flex-col items-center gap-2 w-28 sm:w-32 text-center group">
                    {/* Circle */}
                    <div className="flex items-center justify-center h-12 w-12 rounded-full border border-blue-500/30 bg-blue-600/10 text-blue-400 font-extrabold text-base shadow-[0_0_16px_rgba(59,130,246,0.18)] group-hover:bg-blue-600/20 group-hover:border-blue-400/60 transition-all">
                      {i + 1}
                    </div>
                    {/* Label */}
                    <span className="text-sm font-bold text-[#D6E0F5] leading-tight">
                      {step.label}
                    </span>
                    {/* Desc */}
                    <span className="text-xs text-[#4B6A9B] leading-snug hidden sm:block">
                      {step.desc}
                    </span>
                  </div>

                  {/* Arrow connector — hidden after last */}
                  {i < PIPELINE_STEPS.length - 1 && (
                    <div className="flex items-center self-start mt-4 text-[#2E3F55]">
                      <ChevronRight className="h-5 w-5" />
                    </div>
                  )}
                </React.Fragment>
              ))}
            </div>
          </div>
        </section>

        {/* ════════════════════════════════════════════════════════════════════
            PLAYBOOKS GRID
        ════════════════════════════════════════════════════════════════════ */}
        <section className="py-20 border-t border-[#1E2A3A]">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">

            {/* Section header */}
            <div className="text-center max-w-3xl mx-auto mb-14">
              <p className="text-xs font-bold uppercase tracking-widest text-blue-400 mb-3">
                Recovery Playbooks
              </p>
              <h2 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-[#F0F4FF] tracking-tight mb-4">
                7 Production Recovery Vectors
              </h2>
              <p className="text-base text-[#6B7FA3] leading-relaxed">
                Each playbook maps a distinct revenue-loss pattern to a bounded, auditable
                intervention — from gateway failover to bilingual outreach.
              </p>
            </div>

            {/* Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
              {PLAYBOOKS.map((p) => {
                const Icon = p.icon;
                return (
                  <Link
                    key={p.num}
                    href="/dashboard"
                    className={`group rounded-2xl border ${ACCENT_BORDER[p.accent]} bg-[#0D1320] p-6 flex flex-col gap-4 transition-all hover:-translate-y-1 hover:bg-[#101825] focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-[#070A10]`}
                  >
                    {/* Number + icon row */}
                    <div className="flex items-center justify-between">
                      <span className={`text-xs font-extrabold tracking-widest ${ACCENT_NUM[p.accent]}`}>
                        {p.num}
                      </span>
                      <div className={`flex h-9 w-9 items-center justify-center rounded-lg border ${ACCENT_ICON_BG[p.accent]} transition-all group-hover:scale-110`}>
                        <Icon className="h-4.5 w-4.5" />
                      </div>
                    </div>

                    {/* Title */}
                    <h3 className="text-base font-bold text-[#E8EFF8] leading-snug">
                      {p.title}
                    </h3>

                    {/* Description */}
                    <p className="text-sm text-[#5A7299] leading-relaxed flex-1">
                      {p.desc}
                    </p>

                    {/* CTA hint */}
                    <div className="flex items-center gap-1 text-xs font-semibold text-[#3B6EA5] group-hover:text-blue-400 transition-colors">
                      View in dashboard
                      <ArrowRight className="h-3.5 w-3.5" />
                    </div>
                  </Link>
                );
              })}

              {/* Launch CTA tile */}
              <Link
                href="/dashboard"
                className="group rounded-2xl border border-dashed border-[#1E2A3A] bg-[#0A0F1A] p-6 flex flex-col items-center justify-center gap-4 hover:border-blue-500/40 hover:bg-[#0D1320] transition-all focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-[#070A10]"
              >
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-600/10 border border-blue-500/30 group-hover:bg-blue-600/20 group-hover:border-blue-400/60 transition-all">
                  <BarChart3 className="h-6 w-6 text-blue-400" />
                </div>
                <div className="text-center">
                  <p className="text-sm font-bold text-[#6B7FA3] group-hover:text-[#B0C4E8] transition-colors">
                    Launch Command Center
                  </p>
                  <p className="text-xs text-[#3B4F6A] mt-1">View all recovery cases live</p>
                </div>
                <div className="flex items-center gap-1 text-xs font-semibold text-[#2E4870] group-hover:text-blue-400 transition-colors">
                  Open dashboard <ArrowRight className="h-3.5 w-3.5" />
                </div>
              </Link>
            </div>
          </div>
        </section>

        {/* ════════════════════════════════════════════════════════════════════
            FOOTER
        ════════════════════════════════════════════════════════════════════ */}
        <footer className="border-t border-[#1E2A3A] py-10 bg-[#070A10]">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-6">

            {/* Brand */}
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600/20 border border-blue-500/40">
                <Zap className="h-4 w-4 text-blue-400" />
              </div>
              <div>
                <p className="text-sm font-extrabold text-[#F0F4FF] leading-none">RecoverAI</p>
                <p className="text-xs text-[#3B4F6A] mt-0.5">Deterministic Revenue Recovery Platform</p>
              </div>
            </div>

            {/* Stack callout */}
            <p className="text-xs text-[#3B4F6A] text-center sm:text-right leading-relaxed max-w-md">
              Built with Next.js App Router · OGL Galaxy · GSAP FoldText · Razorpay Rail Simulator
              <br />
              <span className="text-[#4B6A9B]">Razorpay Buildathon Submission</span>
            </p>
          </div>
        </footer>

      </div>
    </>
  );
}
