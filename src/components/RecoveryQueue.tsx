"use client";

import React, { useState, useMemo } from 'react';
import {
  Zap,
  Search,
  CheckCircle2,
  AlertTriangle,
  Clock,
  ChevronRight,
  RefreshCw,
  ShieldAlert,
  XCircle,
  Loader2,
  Eye,
  Filter,
  Inbox,
} from 'lucide-react';

/* ─────────────────────────────────────────
   Types
───────────────────────────────────────── */
interface RecoveryQueueProps {
  cases: any[];
  loading: boolean;
  onSelectCase: (id: string) => void;
  onRunWorkflow: (id: string) => void;
  processingId: string | null;
  onRefresh: () => void;
}

/* ─────────────────────────────────────────
   Constants
───────────────────────────────────────── */
const PLAYBOOKS = [
  { value: 'ALL',                       label: 'All 7 Playbooks' },
  { value: 'PAYMENT_DEGRADATION',       label: 'Payment Degradation' },
  { value: 'CHECKOUT_ABANDONMENT',      label: 'Checkout Abandonment' },
  { value: 'FAILED_SUBSCRIPTION',       label: 'Failed Subscription' },
  { value: 'B2B_OVERDUE_RECEIVABLES',   label: 'B2B Overdue Receivables' },
  { value: 'MANDATE_RETRY',             label: 'Mandate Retry' },
  { value: 'HINGLISH_RECOVERY',         label: 'Hinglish Recovery' },
  { value: 'PROMISE_TO_PAY',            label: 'Promise-to-Pay' },
];

const STATUSES = [
  { value: 'ALL',                label: 'All Statuses' },
  { value: 'DETECTED',          label: 'Detected' },
  { value: 'DIAGNOSING',        label: 'Diagnosing' },
  { value: 'DECIDED',           label: 'Decided' },
  { value: 'ACTION_IN_PROGRESS',label: 'Action In Progress' },
  { value: 'VERIFYING',         label: 'Verifying' },
  { value: 'RECOVERED',         label: 'Recovered' },
  { value: 'ESCALATED',         label: 'Escalated' },
  { value: 'STOPPED',           label: 'Stopped' },
];

const SEGMENT_COLORS: Record<string, string> = {
  ENTERPRISE:    'bg-indigo-900/50 text-indigo-300 border-indigo-600/40',
  SMB:           'bg-blue-900/50  text-blue-300  border-blue-600/40',
  D2C_RETAIL:    'bg-purple-900/50 text-purple-300 border-purple-600/40',
  HIGH_LTV_VIP:  'bg-amber-900/50 text-amber-300  border-amber-600/40',
};

/* ─────────────────────────────────────────
   Status badge
───────────────────────────────────────── */
function StatusBadge({ status }: { status: string }) {
  switch (status) {
    case 'RECOVERED':
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-950/70 border border-emerald-500/40 text-emerald-400">
          <CheckCircle2 className="h-2.5 w-2.5" />
          Recovered
        </span>
      );
    case 'ESCALATED':
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-950/70 border border-amber-500/40 text-amber-400">
          <AlertTriangle className="h-2.5 w-2.5" />
          Escalated
        </span>
      );
    case 'ACTION_IN_PROGRESS':
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-blue-950/70 border border-blue-500/40 text-blue-400 animate-pulse">
          <Zap className="h-2.5 w-2.5" />
          In Progress
        </span>
      );
    case 'DIAGNOSING':
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-cyan-950/70 border border-cyan-500/40 text-cyan-400">
          <Loader2 className="h-2.5 w-2.5 animate-spin" />
          Diagnosing
        </span>
      );
    case 'DETECTED':
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-800 border border-slate-600/50 text-slate-300">
          <Clock className="h-2.5 w-2.5" />
          Detected
        </span>
      );
    case 'VERIFYING':
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-violet-950/70 border border-violet-500/40 text-violet-400">
          <Eye className="h-2.5 w-2.5" />
          Verifying
        </span>
      );
    default:
      // STOPPED, STOPPED_MAX_RETRIES, STOPPED_UNRECOVERABLE, etc.
      if ((status || '').startsWith('STOPPED')) {
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-rose-950/70 border border-rose-500/40 text-rose-400">
            <XCircle className="h-2.5 w-2.5" />
            Stopped
          </span>
        );
      }
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-800 border border-slate-600/50 text-slate-300">
          <Clock className="h-2.5 w-2.5" />
          {(status || 'UNKNOWN').replace(/_/g, ' ')}
        </span>
      );
  }
}

/* ─────────────────────────────────────────
   Confidence progress bar
───────────────────────────────────────── */
function ConfidenceBar({ value }: { value: number }) {
  const pct = Math.min(100, Math.max(0, value));
  const color =
    pct >= 75
      ? 'bg-emerald-400'
      : pct >= 50
      ? 'bg-cyan-400'
      : pct >= 30
      ? 'bg-amber-400'
      : 'bg-rose-400';

  return (
    <div className="flex items-center gap-1.5 min-w-[80px]">
      <div className="flex-1 h-1.5 rounded-full bg-slate-800 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${color}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-[11px] font-mono text-slate-300 w-8 text-right">{pct}%</span>
    </div>
  );
}

/* ─────────────────────────────────────────
   Skeleton rows
───────────────────────────────────────── */
function SkeletonRows() {
  return (
    <>
      {Array.from({ length: 6 }).map((_, i) => (
        <tr key={i} className="border-b border-[#252D3A] animate-pulse">
          {Array.from({ length: 7 }).map((__, j) => (
            <td key={j} className="py-3 px-4">
              <div
                className="h-3 rounded bg-[#252D3A]"
                style={{ width: `${55 + ((i * 7 + j * 13) % 35)}%` }}
              />
              {j === 1 && (
                <div className="h-2 mt-1.5 rounded bg-[#252D3A] w-16" />
              )}
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

/* ─────────────────────────────────────────
   Helpers
───────────────────────────────────────── */
function fmtINR(amount: number) {
  return `₹${Number(amount || 0).toLocaleString('en-IN')}`;
}

function isTerminal(status: string) {
  return (
    status === 'RECOVERED' ||
    status === 'ESCALATED' ||
    (status || '').startsWith('STOPPED')
  );
}

/* ─────────────────────────────────────────
   Main component
───────────────────────────────────────── */
export const RecoveryQueue: React.FC<RecoveryQueueProps> = ({
  cases = [],
  loading,
  onSelectCase,
  onRunWorkflow,
  processingId,
  onRefresh,
}) => {
  const [searchTerm,      setSearchTerm]      = useState('');
  const [selectedPlaybook, setSelectedPlaybook] = useState('ALL');
  const [selectedStatus,  setSelectedStatus]  = useState('ALL');

  /* ── Filtered cases ── */
  const filteredCases = useMemo(() => {
    const q = searchTerm.toLowerCase();
    return (cases || []).filter((c) => {
      if (!c) return false;

      const matchesSearch =
        !q ||
        (c.id              || '').toLowerCase().includes(q) ||
        (c.customer_name   || '').toLowerCase().includes(q) ||
        (c.failure_reason  || '').toLowerCase().includes(q) ||
        (c.playbook        || '').toLowerCase().includes(q);

      const matchesPlaybook =
        selectedPlaybook === 'ALL' || c.playbook === selectedPlaybook;

      const statusNorm = (c.status || '').startsWith('STOPPED')
        ? 'STOPPED'
        : c.status;
      const matchesStatus =
        selectedStatus === 'ALL' || statusNorm === selectedStatus;

      return matchesSearch && matchesPlaybook && matchesStatus;
    });
  }, [cases, searchTerm, selectedPlaybook, selectedStatus]);

  /* ─────────────────────────────────────
     Render
  ───────────────────────────────────── */
  return (
    <div className="rounded-xl border border-[#252D3A] bg-[#10151F] shadow-xl overflow-hidden">

      {/* ── Header & filters ── */}
      <div className="border-b border-[#252D3A] p-5 bg-[#141A24]/60">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          {/* Title block */}
          <div>
            <h2 className="text-sm font-bold uppercase tracking-wider text-[#F5F7FA] flex items-center gap-2">
              <Zap className="h-4 w-4 text-blue-400 flex-shrink-0" />
              Live Recovery Queue &amp; Playbook Runner
            </h2>
            <p className="text-xs text-[#98A2B3] mt-0.5">
              Closed-loop intervention queue spanning 7 autonomous playbooks
            </p>
          </div>

          {/* Refresh + count */}
          <div className="flex items-center gap-3">
            <span className="text-xs text-[#98A2B3] hidden sm:inline">
              {loading ? '—' : `${filteredCases.length} cases matching filters`}
            </span>
            <button
              onClick={onRefresh}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#252D3A] bg-[#10151F] text-xs font-medium text-[#98A2B3] hover:text-[#F5F7FA] hover:border-slate-600 transition-all cursor-pointer"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Refresh
            </button>
          </div>
        </div>

        {/* Filter row */}
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-2.5">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-[#98A2B3] pointer-events-none" />
            <input
              type="text"
              placeholder="Search case ID, customer, reason…"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full rounded-lg border border-[#252D3A] bg-[#080B12] py-2 pl-8 pr-3 text-xs text-[#F5F7FA] placeholder-[#98A2B3] focus:border-blue-500/70 focus:outline-none transition-colors"
            />
          </div>

          {/* Playbook filter */}
          <div className="relative">
            <Filter className="absolute left-3 top-2.5 h-3.5 w-3.5 text-[#98A2B3] pointer-events-none" />
            <select
              value={selectedPlaybook}
              onChange={(e) => setSelectedPlaybook(e.target.value)}
              className="w-full appearance-none rounded-lg border border-[#252D3A] bg-[#080B12] py-2 pl-8 pr-3 text-xs text-[#F5F7FA] focus:border-blue-500/70 focus:outline-none transition-colors cursor-pointer"
            >
              {PLAYBOOKS.map((p) => (
                <option key={p.value} value={p.value}>{p.label}</option>
              ))}
            </select>
          </div>

          {/* Status filter */}
          <div className="relative">
            <ShieldAlert className="absolute left-3 top-2.5 h-3.5 w-3.5 text-[#98A2B3] pointer-events-none" />
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="w-full appearance-none rounded-lg border border-[#252D3A] bg-[#080B12] py-2 pl-8 pr-3 text-xs text-[#F5F7FA] focus:border-blue-500/70 focus:outline-none transition-colors cursor-pointer"
            >
              {STATUSES.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Mobile case count */}
        {!loading && (
          <p className="mt-2.5 text-xs text-[#98A2B3] sm:hidden">
            {filteredCases.length} case{filteredCases.length !== 1 ? 's' : ''} matching filters
          </p>
        )}
      </div>

      {/* ── Table ── */}
      <div className="overflow-x-auto">
        <table className="w-full text-left min-w-[900px]">
          <thead className="border-b border-[#252D3A] bg-[#080B12]">
            <tr>
              {[
                'Case ID',
                'Customer',
                'Playbook / Reason',
                'Amount at Risk',
                'Confidence',
                'Status',
                'Actions',
              ].map((h, idx) => (
                <th
                  key={h}
                  className={`
                    py-2.5 px-4 text-[11px] font-semibold uppercase tracking-wider text-[#98A2B3]
                    ${idx === 6 ? 'text-right' : ''}
                  `}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>

          <tbody className="divide-y divide-[#252D3A]">
            {/* Loading skeleton */}
            {loading && <SkeletonRows />}

            {/* Empty state */}
            {!loading && filteredCases.length === 0 && (
              <tr>
                <td colSpan={7}>
                  <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
                    <Inbox className="h-10 w-10 text-[#252D3A]" />
                    <p className="text-sm font-semibold text-[#98A2B3]">
                      {cases.length === 0
                        ? 'No recovery cases yet'
                        : 'No cases match your filters'}
                    </p>
                    <p className="text-xs text-[#98A2B3]/70 max-w-xs">
                      {cases.length === 0
                        ? 'Run the Batch Simulator to generate revenue-loss scenarios and seed the queue.'
                        : 'Try adjusting your search term, playbook, or status filter.'}
                    </p>
                    {cases.length === 0 && (
                      <button
                        onClick={onRefresh}
                        className="mt-1 flex items-center gap-1.5 px-4 py-2 rounded-lg border border-[#252D3A] bg-[#141A24] text-xs font-medium text-[#98A2B3] hover:text-[#F5F7FA] transition-all cursor-pointer"
                      >
                        <RefreshCw className="h-3.5 w-3.5" />
                        Refresh Queue
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            )}

            {/* Data rows */}
            {!loading &&
              filteredCases.map((c) => {
                const isProcessing = processingId === c.id;
                const terminal = isTerminal(c.status);

                /* Normalise flat API fields vs. nested RecoveryCase */
                const customerName    = c.customer_name    ?? c.customer?.name    ?? '—';
                const customerSegment = c.customer_segment ?? c.customer?.segment ?? '';
                const playbook        = c.playbook         ?? c.category          ?? '—';
                const failureReason   = c.failure_reason   ?? c.transaction?.failureReasonText ?? '';
                const amount          = Number(c.amount    ?? c.transaction?.amount    ?? 0);
                const recoveredAmount = Number(c.recovered_amount ?? c.recoveredAmount ?? 0);
                const confidence      = Number(c.recovery_confidence ?? c.recoveryConfidence ?? 0);

                return (
                  <tr
                    key={c.id}
                    onClick={() => onSelectCase(c.id)}
                    className="cursor-pointer transition-colors duration-100 hover:bg-[#141A24]/80 group"
                  >
                    {/* Case ID */}
                    <td className="py-3 px-4 align-middle">
                      <span className="font-mono text-xs font-bold text-blue-400 group-hover:text-blue-300 transition-colors">
                        {c.id}
                      </span>
                    </td>

                    {/* Customer */}
                    <td className="py-3 px-4 align-middle">
                      <div className="text-xs font-semibold text-[#F5F7FA] truncate max-w-[130px]">
                        {customerName}
                      </div>
                      {customerSegment && (
                        <span
                          className={`
                            mt-0.5 inline-block px-1.5 py-0.5 rounded text-[9px] font-semibold uppercase border
                            ${SEGMENT_COLORS[customerSegment] ?? 'bg-slate-800 text-slate-400 border-slate-600/40'}
                          `}
                        >
                          {customerSegment.replace(/_/g, ' ')}
                        </span>
                      )}
                    </td>

                    {/* Playbook / Reason */}
                    <td className="py-3 px-4 align-middle">
                      <div className="text-xs font-medium text-[#F5F7FA]">
                        {playbook.replace(/_/g, ' ')}
                      </div>
                      {failureReason && (
                        <div className="text-[10px] text-amber-300/80 truncate max-w-[180px] mt-0.5">
                          {failureReason}
                        </div>
                      )}
                    </td>

                    {/* Amount at Risk */}
                    <td className="py-3 px-4 align-middle">
                      <div className="text-sm font-bold text-[#F5F7FA]">
                        {fmtINR(amount)}
                      </div>
                      {c.status === 'RECOVERED' && recoveredAmount > 0 && (
                        <div className="text-[10px] text-emerald-400 font-semibold mt-0.5">
                          +{fmtINR(recoveredAmount)} recovered
                        </div>
                      )}
                    </td>

                    {/* Confidence */}
                    <td className="py-3 px-4 align-middle">
                      <ConfidenceBar value={confidence} />
                    </td>

                    {/* Status */}
                    <td className="py-3 px-4 align-middle">
                      <StatusBadge status={c.status} />
                    </td>

                    {/* Actions — stop row-click propagation */}
                    <td
                      className="py-3 px-4 align-middle text-right"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="flex items-center justify-end gap-2">
                        {!terminal ? (
                          /* Execute Recovery */
                          <button
                            onClick={() => onRunWorkflow(c.id)}
                            disabled={isProcessing || processingId !== null}
                            className="
                              flex items-center gap-1 px-3 py-1.5 rounded-lg
                              bg-blue-600 hover:bg-blue-500
                              text-white font-semibold text-[11px]
                              shadow-[0_0_12px_rgba(59,130,246,0.3)]
                              disabled:opacity-50 disabled:cursor-not-allowed
                              transition-all cursor-pointer
                            "
                          >
                            {isProcessing ? (
                              <>
                                <Loader2 className="h-3 w-3 animate-spin" />
                                Running…
                              </>
                            ) : (
                              <>
                                <Zap className="h-3 w-3" />
                                Execute Recovery
                              </>
                            )}
                          </button>
                        ) : (
                          /* Trace */
                          <button
                            onClick={() => onSelectCase(c.id)}
                            className="
                              flex items-center gap-1 px-2.5 py-1.5 rounded-lg
                              border border-[#252D3A] bg-[#141A24]
                              text-[#98A2B3] hover:text-[#F5F7FA] hover:border-slate-500
                              text-[11px] font-medium
                              transition-colors cursor-pointer
                            "
                          >
                            <Eye className="h-3 w-3" />
                            Trace
                            <ChevronRight className="h-3 w-3" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>

      {/* ── Footer: total count ── */}
      {!loading && filteredCases.length > 0 && (
        <div className="border-t border-[#252D3A] bg-[#080B12] px-5 py-2.5 flex items-center justify-between">
          <span className="text-xs text-[#98A2B3]">
            Showing{' '}
            <span className="font-semibold text-[#F5F7FA]">{filteredCases.length}</span>
            {' '}case{filteredCases.length !== 1 ? 's' : ''} matching filters
            {cases.length !== filteredCases.length && (
              <span className="text-[#98A2B3]">
                {' '}(of{' '}
                <span className="font-semibold text-[#F5F7FA]">{cases.length}</span>
                {' '}total)
              </span>
            )}
          </span>
          <div className="flex items-center gap-1.5">
            <div className="h-1.5 w-1.5 rounded-full bg-blue-500 shadow-[0_0_6px_#3B82F6]" />
            <span className="text-[10px] text-[#98A2B3] uppercase tracking-wider font-medium">
              Live
            </span>
          </div>
        </div>
      )}
    </div>
  );
};
