"use client";

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  History,
  RefreshCw,
  Search,
  Filter,
  Clock,
  User,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  ChevronDown,
} from 'lucide-react';
import { fetchWithTimeout } from '@/lib/fetch-with-timeout';

// ─── Stage config ─────────────────────────────────────────────────────────────

type StageKey =
  | 'DETECT'
  | 'DIAGNOSE'
  | 'DECIDE_PLAYBOOK'
  | 'CHECK_GUARDRAILS'
  | 'EXECUTE_ACTION'
  | 'VERIFY'
  | 'STOP_OR_ESCALATE';

const STAGE_CONFIG: Record<StageKey, { dot: string; badge: string; label: string }> = {
  DETECT:           { dot: 'bg-amber-400',   badge: 'bg-amber-500/15 border-amber-500/30 text-amber-300',    label: 'Detect'           },
  DIAGNOSE:         { dot: 'bg-cyan-400',    badge: 'bg-cyan-500/15 border-cyan-500/30 text-cyan-300',       label: 'Diagnose'         },
  DECIDE_PLAYBOOK:  { dot: 'bg-indigo-400',  badge: 'bg-indigo-500/15 border-indigo-500/30 text-indigo-300', label: 'Decide Playbook'  },
  CHECK_GUARDRAILS: { dot: 'bg-blue-400',    badge: 'bg-blue-500/15 border-blue-500/30 text-blue-300',       label: 'Check Guardrails' },
  EXECUTE_ACTION:   { dot: 'bg-purple-400',  badge: 'bg-purple-500/15 border-purple-500/30 text-purple-300', label: 'Execute Action'   },
  VERIFY:           { dot: 'bg-emerald-400', badge: 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300', label: 'Verify'        },
  STOP_OR_ESCALATE: { dot: 'bg-rose-400',    badge: 'bg-rose-500/15 border-rose-500/30 text-rose-300',       label: 'Stop / Escalate'  },
};

const RESULT_CONFIG: Record<string, { cls: string; icon: React.ReactNode }> = {
  SUCCESS:   { cls: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30', icon: <CheckCircle2 className="h-3 w-3" /> },
  ESCALATED: { cls: 'text-amber-400 bg-amber-500/10 border-amber-500/30',       icon: <AlertTriangle className="h-3 w-3" /> },
  NOT_RECOVERED: { cls: 'text-slate-300 bg-slate-500/10 border-slate-500/30',   icon: <Clock className="h-3 w-3" /> },
  FAILED:    { cls: 'text-rose-400 bg-rose-500/10 border-rose-500/30',          icon: <XCircle className="h-3 w-3" /> },
  BLOCKED:   { cls: 'text-orange-400 bg-orange-500/10 border-orange-500/30',    icon: <XCircle className="h-3 w-3" /> },
};

function timeAgo(ts: string): string {
  const diff = Date.now() - new Date(ts).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function formatAbsolute(ts: string): string {
  try {
    return new Date(ts).toLocaleString('en-IN', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      hour12: false,
    });
  } catch {
    return ts;
  }
}

function formatAuditDetails(value: string): string {
  return value.replace(/(\d+)\/(\d+)/g, (_, attempt, maximum) => {
    const used = Number(attempt);
    const limit = Number(maximum);
    return used > limit ? `retry limit exceeded (attempt ${used}; maximum ${limit})` : `${used} of ${limit}`;
  });
}

function SkeletonRow() {
  return (
    <div className="flex gap-4 py-4 animate-pulse">
      <div className="relative flex flex-col items-center flex-shrink-0 w-5">
        <div className="h-4 w-4 rounded-full bg-[#252D3A]" />
      </div>
      <div className="flex-1 space-y-2">
        <div className="flex gap-2 items-center">
          <div className="h-5 w-24 rounded bg-[#252D3A]" />
          <div className="h-4 w-16 rounded bg-[#252D3A]" />
          <div className="h-4 w-20 rounded bg-[#252D3A]" />
        </div>
        <div className="h-3.5 w-3/4 rounded bg-[#252D3A]" />
        <div className="h-3 w-1/2 rounded bg-[#252D3A]" />
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

// Signature no longer requires a `cases` prop — fetches from /api/audit directly
export const AuditTrailView: React.FC = () => {
  const [events, setEvents]           = useState<any[]>([]);
  const [total, setTotal]             = useState(0);
  const [loading, setLoading]         = useState(true);
  const [stageFilter, setStageFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [error, setError]             = useState<string | null>(null);

  const fetchAudits = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ limit: '300' });
      if (stageFilter !== 'ALL') params.set('stage', stageFilter);

      const res = await fetchWithTimeout(`/api/audit?${params.toString()}`, {}, 10000);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setEvents(data.audits || []);
      setTotal(data.total ?? (data.audits?.length ?? 0));
    } catch (err) {
      console.error('Failed to load audit events:', err);
      setError('Could not fetch audit data. Please try refreshing.');
    } finally {
      setLoading(false);
    }
  }, [stageFilter]);

  // Fetch when stage filter changes
  useEffect(() => {
    fetchAudits();
  }, [fetchAudits]);

  // Client-side search filter
  const filtered = useMemo(() => {
    if (!searchQuery.trim()) return events;
    const q = searchQuery.trim().toLowerCase();
    return events.filter(
      (e) =>
        (e.case_id || '').toLowerCase().includes(q) ||
        (e.customer_name || '').toLowerCase().includes(q) ||
        (e.actor || '').toLowerCase().includes(q) ||
        (e.details || '').toLowerCase().includes(q)
    );
  }, [events, searchQuery]);

  const stageOptions = [
    { value: 'ALL',              label: 'All Stages' },
    { value: 'DETECT',           label: 'Detect' },
    { value: 'DIAGNOSE',         label: 'Diagnose' },
    { value: 'DECIDE_PLAYBOOK',  label: 'Decide Playbook' },
    { value: 'CHECK_GUARDRAILS', label: 'Check Guardrails' },
    { value: 'EXECUTE_ACTION',   label: 'Execute Action' },
    { value: 'VERIFY',           label: 'Verify' },
    { value: 'STOP_OR_ESCALATE', label: 'Stop / Escalate' },
  ];

  return (
    <div className="rounded-xl border border-[#252D3A] bg-[#141A24] p-6 shadow-xl space-y-5">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 border-b border-[#252D3A] pb-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 rounded-lg bg-blue-600/20 text-blue-400 border border-blue-500/30">
              <History className="h-5 w-5" />
            </div>
            <h3 className="text-base font-bold text-[#F5F7FA]">
              Immutable FinTech Audit Trail &amp; Event Ledger
            </h3>
          </div>
          <p className="text-xs text-[#98A2B3] mt-1 max-w-xl">
            Every autonomous detection, diagnosis, decision, intervention, and webhook verification
            recorded in sequence. Cryptographically ordered and tamper-evident.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {!loading && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-[#252D3A] bg-[#10151F]">
              <span className="h-2 w-2 rounded-full bg-blue-400 shadow-[0_0_6px_#60A5FA]" />
              <span className="text-xs font-semibold text-[#98A2B3]">
                {filtered.length.toLocaleString()} event{filtered.length !== 1 ? 's' : ''}
              </span>
            </div>
          )}
          <button
            onClick={fetchAudits}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#252D3A] bg-[#10151F] text-xs font-medium text-[#98A2B3] hover:text-[#F5F7FA] hover:border-slate-600 transition-all disabled:opacity-50 cursor-pointer"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[#98A2B3] pointer-events-none" />
          <input
            type="text"
            placeholder="Search case ID, customer, actor, details…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-lg border border-[#252D3A] bg-[#10151F] pl-9 pr-4 py-2 text-xs text-[#F5F7FA] placeholder:text-[#4B5563] focus:border-blue-500 focus:outline-none transition-colors"
          />
        </div>

        <div className="relative">
          <Filter className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[#98A2B3] pointer-events-none" />
          <select
            value={stageFilter}
            onChange={(e) => setStageFilter(e.target.value)}
            className="appearance-none rounded-lg border border-[#252D3A] bg-[#10151F] pl-9 pr-8 py-2 text-xs text-[#F5F7FA] focus:border-blue-500 focus:outline-none transition-colors cursor-pointer"
          >
            {stageOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
          <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[#98A2B3] pointer-events-none" />
        </div>
      </div>

      {/* Timeline */}
      {loading ? (
        <div className="space-y-0 divide-y divide-[#1A2030]">
          {Array.from({ length: 8 }).map((_, i) => <SkeletonRow key={i} />)}
        </div>
      ) : error ? (
        <div className="py-12 flex flex-col items-center gap-3 text-center">
          <XCircle className="h-8 w-8 text-rose-400" />
          <p className="text-sm text-rose-300 font-medium">{error}</p>
          <button
            onClick={fetchAudits}
            className="px-4 py-2 rounded-lg border border-rose-500/40 bg-rose-950/30 text-rose-300 text-xs font-semibold hover:bg-rose-900/40 transition-all"
          >
            Retry
          </button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="py-14 flex flex-col items-center gap-4 text-center">
          <div className="p-4 rounded-full bg-[#10151F] border border-[#252D3A]">
            <History className="h-8 w-8 text-[#4B5563]" />
          </div>
          <div>
            <p className="text-sm font-semibold text-[#F5F7FA]">No audit events found</p>
            <p className="text-xs text-[#98A2B3] mt-1 max-w-xs">
              {searchQuery || stageFilter !== 'ALL'
                ? 'Try clearing your filters or searching for a different term.'
                : 'Execute a recovery workflow or run a batch simulation to generate audit records.'}
            </p>
          </div>
        </div>
      ) : (
        <div className="max-h-[620px] overflow-y-auto pr-1">
          <div className="relative">
            {/* Vertical connector */}
            <div className="absolute left-[9px] top-4 bottom-4 w-px bg-gradient-to-b from-blue-500/40 via-[#252D3A] to-transparent pointer-events-none" />

            <ul className="space-y-0">
              {filtered.map((event, idx) => {
                const cfg = STAGE_CONFIG[event.stage as StageKey];
                const dotColor   = cfg?.dot   ?? 'bg-slate-400';
                const badgeCls   = cfg?.badge  ?? 'bg-slate-500/15 border-slate-500/30 text-slate-300';
                const resultCfg  = RESULT_CONFIG[event.result] ?? {
                  cls: 'text-slate-400 bg-slate-500/10 border-slate-500/30',
                  icon: null,
                };
                const isLast = idx === filtered.length - 1;

                return (
                  <li
                    key={event.id ?? `${event.case_id}-${idx}`}
                    className={`relative flex gap-4 py-4 ${!isLast ? 'border-b border-[#1A2030]' : ''}`}
                  >
                    {/* Dot */}
                    <div className="relative flex-shrink-0 flex flex-col items-center mt-0.5">
                      <span className={`h-[18px] w-[18px] rounded-full border-2 border-[#141A24] shadow-lg ${dotColor}`} />
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0 space-y-1.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded border text-[10px] font-bold uppercase tracking-wide ${badgeCls}`}>
                          {(event.stage || '').replace(/_/g, ' ')}
                        </span>
                        <span className="font-mono text-[11px] font-bold text-blue-400">{event.case_id}</span>
                        {event.customer_name && event.customer_name !== 'Unknown' && (
                          <span className="text-xs font-semibold text-[#F5F7FA] truncate">{event.customer_name}</span>
                        )}
                        {event.amount > 0 && (
                          <span className="font-mono text-[11px] text-[#98A2B3]">
                            ₹{Number(event.amount).toLocaleString('en-IN')}
                          </span>
                        )}
                      </div>

                      <p className="text-xs text-[#CBD5E1] leading-relaxed">{formatAuditDetails(event.details || '')}</p>

                      <div className="flex flex-wrap items-center gap-3">
                        <span className="flex items-center gap-1 text-[11px] text-[#98A2B3]">
                          <User className="h-3 w-3 shrink-0" />
                          <span className="truncate max-w-[180px]">{(event.actor || '').replace(/_/g, ' ')}</span>
                        </span>

                        {event.action && (
                          <span className="text-[11px] text-[#4B5563] font-mono truncate max-w-[160px]">
                            {event.action}
                          </span>
                        )}

                        {event.result && (
                          <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-[10px] font-bold ${resultCfg.cls}`}>
                            {resultCfg.icon}
                            {event.result}
                          </span>
                        )}

                        <span className="flex items-center gap-1 text-[11px] text-[#4B5563] font-mono ml-auto whitespace-nowrap">
                          <Clock className="h-3 w-3 shrink-0" />
                          {event.timestamp ? (
                            <span title={formatAbsolute(event.timestamp)}>
                              {timeAgo(event.timestamp)}
                              <span className="hidden sm:inline text-[#374151]">
                                {' '}· {formatAbsolute(event.timestamp)}
                              </span>
                            </span>
                          ) : '—'}
                        </span>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      )}

      {/* Footer */}
      {!loading && filtered.length > 0 && (
        <div className="pt-3 border-t border-[#252D3A] flex items-center justify-between text-[11px] text-[#4B5563]">
          <span>
            Showing <span className="text-[#98A2B3] font-semibold">{filtered.length}</span> of{' '}
            <span className="text-[#98A2B3] font-semibold">{total}</span> total events
          </span>
          <span className="flex items-center gap-1">
            <RefreshCw className="h-3 w-3" />
            Refreshes with each simulation
          </span>
        </div>
      )}
    </div>
  );
};
