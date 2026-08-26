"use client";

import React from 'react';
import {
  AlertTriangle,
  Banknote,
  CheckCircle2,
  TrendingUp,
  Activity,
  ShieldAlert,
  BookOpen,
} from 'lucide-react';

interface MetricsOverviewProps {
  metrics: any;
  loading: boolean;
  onVerifiedClick?: () => void;
}

/* ─── Shimmer skeleton card ─── */
const SkeletonCard: React.FC = () => (
  <div className="relative h-28 rounded-xl border border-[#252D3A] bg-[#141A24] overflow-hidden">
    {/* shimmer sweep */}
    <div className="absolute inset-0 -translate-x-full animate-[shimmer_1.6s_infinite] bg-gradient-to-r from-transparent via-white/[0.04] to-transparent" />
    <div className="p-4 flex flex-col justify-between h-full">
      <div className="flex items-center justify-between">
        <div className="h-2.5 w-28 rounded bg-[#252D3A]" />
        <div className="h-8 w-8 rounded-lg bg-[#252D3A]" />
      </div>
      <div>
        <div className="h-6 w-24 rounded bg-[#252D3A] mb-2" />
        <div className="h-2 w-36 rounded bg-[#252D3A]" />
      </div>
    </div>
  </div>
);

/* ─── Main component ─── */
export const MetricsOverview: React.FC<MetricsOverviewProps> = ({ metrics, loading, onVerifiedClick }) => {
  /* ── Loading state: 7 shimmer cards ── */
  if (loading || !metrics) {
    return (
      <>
        <style>{`
          @keyframes shimmer {
            100% { transform: translateX(200%); }
          }
        `}</style>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          {Array.from({ length: 7 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      </>
    );
  }

  /* ── Derived values ── */
  const totalRevenueAtRisk      = Number(metrics.totalRevenueAtRisk      ?? 0);
  const totalRecoverableRevenue = Number(metrics.totalRecoverableRevenue  ?? 0);
  const totalRevenueRecovered   = Number(metrics.totalRevenueRecovered    ?? 0);
  const overallRecoveryRate     = Number(metrics.overallRecoveryRate      ?? 0);
  const totalCasesCount         = Number(metrics.totalCasesCount          ?? 0);
  const escalatedCasesCount     = Number(metrics.escalatedCasesCount      ?? 0);
  const ledgerEntriesCount      = Number(metrics.ledgerEntriesCount       ?? 0);

  /* ── Card definitions ── */
  const cards = [
    {
      id: 'at-risk',
      title: 'Revenue at Risk',
      value: `₹${totalRevenueAtRisk.toLocaleString('en-IN')}`,
      subtitle: 'Detected across all cases',
      icon: AlertTriangle,
      valueColor: 'text-amber-400',
      iconBg: 'bg-amber-500/10 border-amber-500/30',
      iconColor: 'text-amber-400',
      glow: 'shadow-[0_0_22px_rgba(245,158,11,0.10)] hover:shadow-[0_0_32px_rgba(245,158,11,0.18)]',
      border: 'border-[#252D3A] hover:border-amber-500/30',
      accent: '#fbbf24',
    },
    {
      id: 'recoverable',
      title: 'Recoverable Revenue',
      value: `₹${totalRecoverableRevenue.toLocaleString('en-IN')}`,
      subtitle: 'Actionable via playbooks',
      icon: Banknote,
      valueColor: 'text-teal-400',
      iconBg: 'bg-teal-500/10 border-teal-500/30',
      iconColor: 'text-teal-400',
      glow: 'shadow-[0_0_22px_rgba(20,184,166,0.10)] hover:shadow-[0_0_32px_rgba(20,184,166,0.18)]',
      border: 'border-[#252D3A] hover:border-teal-500/30',
      accent: '#2dd4bf',
    },
    {
      id: 'recovered',
      title: 'Verified Recovered',
      value: `₹${totalRevenueRecovered.toLocaleString('en-IN')}`,
      subtitle: 'Webhook-confirmed settlements',
      icon: CheckCircle2,
      valueColor: 'text-emerald-400',
      iconBg: 'bg-emerald-500/10 border-emerald-500/30',
      iconColor: 'text-emerald-400',
      glow: 'shadow-[0_0_22px_rgba(34,197,94,0.12)] hover:shadow-[0_0_32px_rgba(34,197,94,0.20)]',
      border: 'border-[#252D3A] hover:border-emerald-500/30',
      accent: '#34d399',
    },
    {
      id: 'win-rate',
      title: 'Recovery Win Rate',
      value: `${overallRecoveryRate.toFixed(1)}%`,
      subtitle: 'Across 7 active playbooks',
      icon: TrendingUp,
      valueColor: 'text-blue-400',
      iconBg: 'bg-blue-500/10 border-blue-500/30',
      iconColor: 'text-blue-400',
      glow: 'shadow-[0_0_22px_rgba(59,130,246,0.10)] hover:shadow-[0_0_32px_rgba(59,130,246,0.18)]',
      border: 'border-[#252D3A] hover:border-blue-500/30',
      accent: '#60a5fa',
    },
    {
      id: 'active-cases',
      title: 'Active Cases',
      value: totalCasesCount.toLocaleString('en-IN'),
      subtitle: 'In agent processing pipeline',
      icon: Activity,
      valueColor: 'text-cyan-400',
      iconBg: 'bg-cyan-500/10 border-cyan-500/30',
      iconColor: 'text-cyan-400',
      glow: 'shadow-[0_0_22px_rgba(6,182,212,0.10)] hover:shadow-[0_0_32px_rgba(6,182,212,0.18)]',
      border: 'border-[#252D3A] hover:border-cyan-500/30',
      accent: '#22d3ee',
    },
    {
      id: 'escalations',
      title: 'Escalations',
      value: escalatedCasesCount.toLocaleString('en-IN'),
      subtitle: 'Pending human review',
      icon: ShieldAlert,
      valueColor: 'text-purple-300',
      iconBg: 'bg-purple-500/10 border-purple-500/30',
      iconColor: 'text-purple-300',
      glow: 'shadow-[0_0_22px_rgba(168,85,247,0.10)] hover:shadow-[0_0_32px_rgba(168,85,247,0.18)]',
      border: 'border-[#252D3A] hover:border-purple-500/30',
      accent: '#c084fc',
    },
    {
      id: 'ledger',
      title: 'Ledger Entries',
      value: ledgerEntriesCount.toLocaleString('en-IN'),
      subtitle: 'Immutable audit records',
      icon: BookOpen,
      valueColor: 'text-indigo-400',
      iconBg: 'bg-indigo-500/10 border-indigo-500/30',
      iconColor: 'text-indigo-400',
      glow: 'shadow-[0_0_22px_rgba(99,102,241,0.10)] hover:shadow-[0_0_32px_rgba(99,102,241,0.18)]',
      border: 'border-[#252D3A] hover:border-indigo-500/30',
      accent: '#818cf8',
    },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
      {cards.map((card) => {
        const Icon = card.icon;
        return (
          <button
            key={card.id}
            type="button"
            onClick={card.id === 'recovered' ? onVerifiedClick : undefined}
            aria-label={card.id === 'recovered' ? 'Open verified recovery proof' : undefined}
            className={`
              metric-card relative min-h-36 overflow-hidden rounded-2xl border bg-[#141A24]/90
              p-5 flex flex-col justify-between
              transition-all duration-200
              ${card.border}
              ${card.glow}
            `}
            style={{ color: card.accent }}
          >
            {/* Top row: label + icon */}
            <div className="flex items-start justify-between gap-2">
              <span className="text-xs sm:text-sm font-semibold uppercase tracking-wider text-[#98A2B3] leading-tight">
                {card.title}
              </span>
              <div
                className={`
                  flex-shrink-0 p-2 rounded-xl border
                  ${card.iconBg}
                `}
              >
                <Icon className={`h-4 w-4 ${card.iconColor}`} />
              </div>
            </div>

            {/* Bottom: value + subtitle */}
            <div>
              <div
                className={`
                  text-2xl sm:text-3xl font-extrabold tracking-tight leading-none
                  ${card.valueColor}
                `}
              >
                {card.value}
              </div>
              <div className="mt-1.5 text-xs text-[#98A2B3] truncate">
                {card.subtitle}
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
};
