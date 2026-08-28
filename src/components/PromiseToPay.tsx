"use client";

import React, { useState, useEffect } from 'react';
import { Target, RefreshCw, CheckCircle2, AlertTriangle, Clock, Calendar, MessageSquare, Check, X, Bell, RotateCcw } from 'lucide-react';
import { fetchWithTimeout } from '@/lib/fetch-with-timeout';

interface PromiseRecord {
  id: string;
  case_id: string;
  customer_name: string;
  amount: number;
  promise_date: string;
  status: 'PROMISED' | 'UPCOMING' | 'DUE' | 'KEPT' | 'BROKEN' | 'ESCALATED';
  channel: string;
  created_at: string;
}

interface PromiseToPayProps {
  onSelectCase?: (caseId: string) => void;
}

export const PromiseToPay: React.FC<PromiseToPayProps> = ({ onSelectCase }) => {
  const [promises, setPromises] = useState<PromiseRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const fetchPromises = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchWithTimeout('/api/promises', {}, 10000);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setPromises(data.promises || []);
    } catch (err) {
      console.error('Failed to load promises:', err);
      setError('Unable to load promise-to-pay records. Use Refresh to retry.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPromises();
  }, []);

  const handleAction = async (caseId: string, action: string) => {
    setActionLoading(caseId + action);
    setActionError(null);
    try {
      const res = await fetchWithTimeout('/api/promises', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ caseId, action })
      }, 15000);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      await fetchPromises();
    } catch (err) {
      console.error('Promise action error:', err);
      setActionError(err instanceof Error ? err.message : 'Unable to update promise-to-pay record.');
    } finally {
      setActionLoading(null);
    }
  };

  const getStatusConfig = (status: string) => {
    switch (status) {
      case 'KEPT':
        return {
          label: 'Kept',
          className: 'bg-emerald-950/60 border-emerald-500/40 text-emerald-400',
          icon: CheckCircle2,
        };
      case 'BROKEN':
        return {
          label: 'Broken',
          className: 'bg-rose-950/60 border-rose-500/40 text-rose-400',
          icon: AlertTriangle,
        };
      case 'ESCALATED':
        return {
          label: 'Escalated',
          className: 'bg-amber-950/60 border-amber-500/40 text-amber-400',
          icon: AlertTriangle,
        };
      case 'DUE':
        return {
          label: 'Due Today',
          className: 'bg-blue-950/60 border-blue-500/40 text-blue-400 animate-pulse',
          icon: Clock,
        };
      case 'UPCOMING':
        return {
          label: 'Upcoming',
          className: 'bg-cyan-950/60 border-cyan-500/40 text-cyan-400',
          icon: Calendar,
        };
      default:
        return {
          label: 'Promised',
          className: 'bg-indigo-950/60 border-indigo-500/40 text-indigo-400',
          icon: Target,
        };
    }
  };

  const summary = {
    total: promises.length,
    kept: promises.filter(p => p.status === 'KEPT').length,
    broken: promises.filter(p => p.status === 'BROKEN').length,
    due: promises.filter(p => p.status === 'DUE').length,
    upcoming: promises.filter(p => p.status === 'UPCOMING' || p.status === 'PROMISED').length,
    totalAmount: promises.reduce((sum, p) => sum + (p.amount || 0), 0),
    keptAmount: promises.filter(p => p.status === 'KEPT').reduce((sum, p) => sum + (p.amount || 0), 0),
  };

  const fulfilmentRate = summary.total > 0
    ? Math.round((summary.kept / summary.total) * 100)
    : 0;

  return (
    <div className="rounded-xl border border-[#252D3A] bg-[#141A24] p-6 shadow-xl space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#252D3A] pb-5">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 rounded-lg bg-indigo-600/20 text-indigo-400 border border-indigo-500/30">
              <Target className="h-5 w-5" />
            </div>
            <h3 className="text-base font-bold text-[#F5F7FA]">
              Promise-to-Pay Tracker &amp; Fulfilment Guardrail
            </h3>
          </div>
          <p className="text-xs text-[#98A2B3] mt-1 ml-9">
            Prototype demo commitments — track fulfilment, verify settlement, and enforce escalation on broken promise.
          </p>
        </div>

        <button
          onClick={fetchPromises}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[#252D3A] bg-[#10151F] text-xs font-semibold text-[#98A2B3] hover:text-[#F5F7FA] hover:border-slate-600 transition-all cursor-pointer"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Summary KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="rounded-xl border border-[#252D3A] bg-[#10151F] p-4">
          <span className="text-[11px] uppercase font-medium text-[#98A2B3]">Total Commitments</span>
          <p className="text-2xl font-extrabold text-[#F5F7FA] mt-1">{summary.total}</p>
          <p className="text-xs text-[#98A2B3] mt-0.5">
            ₹{summary.totalAmount.toLocaleString('en-IN')} at stake
          </p>
        </div>
        <div className="rounded-xl border border-emerald-500/20 bg-emerald-950/10 p-4">
          <span className="text-[11px] uppercase font-medium text-[#98A2B3]">Fulfilment Rate</span>
          <p className="text-2xl font-extrabold text-emerald-400 mt-1">{fulfilmentRate}%</p>
          <p className="text-xs text-emerald-400/70 mt-0.5">
            ₹{summary.keptAmount.toLocaleString('en-IN')} recovered
          </p>
        </div>
        <div className="rounded-xl border border-blue-500/20 bg-blue-950/10 p-4">
          <span className="text-[11px] uppercase font-medium text-[#98A2B3]">Due / Upcoming</span>
          <p className="text-2xl font-extrabold text-blue-400 mt-1">{summary.due + summary.upcoming}</p>
          <p className="text-xs text-blue-400/70 mt-0.5">{summary.due} due today</p>
        </div>
        <div className="rounded-xl border border-rose-500/20 bg-rose-950/10 p-4">
          <span className="text-[11px] uppercase font-medium text-[#98A2B3]">Broken Promises</span>
          <p className="text-2xl font-extrabold text-rose-400 mt-1">{summary.broken}</p>
          <p className="text-xs text-rose-400/70 mt-0.5">Auto-escalated to collections</p>
        </div>
      </div>

      {actionError && <div role="alert" className="rounded-lg border border-rose-500/30 bg-rose-950/20 px-3 py-2 text-xs text-rose-300">{actionError}</div>}

      {/* Content */}
      {loading ? (
        <div className="space-y-3 py-4" role="status" aria-label="Loading promise-to-pay panel" aria-busy="true">
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="h-12 animate-pulse rounded-lg border border-[#252D3A] bg-[#10151F]" />
          ))}
        </div>
      ) : error ? (
        <div className="py-8 flex flex-col items-center justify-center gap-3 text-rose-400 text-xs text-center">
          <AlertTriangle className="h-6 w-6" />
          <span>{error}</span>
          <button
            onClick={fetchPromises}
            className="px-4 py-2 rounded-lg border border-rose-500/40 bg-rose-950/30 text-rose-300 font-semibold hover:bg-rose-900/40 transition-all cursor-pointer"
          >
            Retry
          </button>
        </div>
      ) : promises.length === 0 ? (
        <div className="py-10 text-center text-xs text-[#98A2B3] space-y-2">
          <Target className="h-8 w-8 text-[#252D3A] mx-auto" />
          <p>No promise-to-pay commitments recorded yet.</p>
          <p className="text-[#98A2B3]/70 text-[10px]">
            Run the Batch Simulator to seed live promise records.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-[#252D3A]">
          <table className="w-full text-left text-xs text-[#98A2B3] min-w-[750px]">
            <thead className="border-b border-[#252D3A] bg-[#080B12] text-[11px] uppercase font-semibold">
              <tr>
                <th className="py-3 px-4">Case ID</th>
                <th className="py-3 px-4">Customer</th>
                <th className="py-3 px-4">Amount Committed</th>
                <th className="py-3 px-4">Promise Date</th>
                <th className="py-3 px-4">Channel</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#252D3A]">
              {promises.map((p) => {
                const cfg = getStatusConfig(p.status);
                const Icon = cfg.icon;
                const promiseDate = p.promise_date ? new Date(p.promise_date) : null;
                const isPast = promiseDate && promiseDate < new Date();
                const isResolved = p.status === 'KEPT' || p.status === 'BROKEN' || p.status === 'ESCALATED';

                return (
                  <tr
                    key={p.id}
                    className="hover:bg-[#10151F] transition-colors"
                  >
                    <td className="py-3 px-4 font-mono font-bold text-indigo-400 text-[11px]">
                      {p.case_id}
                    </td>
                    <td className="py-3 px-4">
                      <span className="font-semibold text-[#F5F7FA]">{p.customer_name}</span>
                    </td>
                    <td className="py-3 px-4">
                      <span className="font-bold text-[#F5F7FA]">
                        ₹{(p.amount || 0).toLocaleString('en-IN')}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <span className={`font-mono text-[11px] ${isPast && p.status !== 'KEPT' ? 'text-rose-400 font-semibold' : 'text-slate-300'}`}>
                        {promiseDate
                          ? promiseDate.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
                          : '—'}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <span className="flex items-center gap-1.5 text-slate-300">
                        <MessageSquare className="h-3 w-3 text-[#98A2B3]" />
                        {p.channel || 'WhatsApp'}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold border ${cfg.className}`}>
                        <Icon className="h-3 w-3" />
                        {cfg.label}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        {!isResolved ? (
                          <>
                            <button
                              onClick={() => handleAction(p.case_id, 'MARK_KEPT')}
                              disabled={actionLoading === p.case_id + 'MARK_KEPT'}
                              title="Mark payment fulfilled & write to recovery ledger"
                              className="px-2 py-1 rounded-md bg-emerald-950/60 border border-emerald-500/40 text-emerald-300 text-[10px] font-bold hover:bg-emerald-900/60 transition-all flex items-center gap-1 cursor-pointer"
                            >
                              <Check className="h-3 w-3" /> Kept
                            </button>
                            <button
                              onClick={() => handleAction(p.case_id, 'MARK_BROKEN')}
                              disabled={actionLoading === p.case_id + 'MARK_BROKEN'}
                              title="Mark breached and trigger escalation"
                              className="px-2 py-1 rounded-md bg-rose-950/60 border border-rose-500/40 text-rose-300 text-[10px] font-bold hover:bg-rose-900/60 transition-all flex items-center gap-1 cursor-pointer"
                            >
                              <X className="h-3 w-3" /> Broken
                            </button>
                            <button
                              onClick={() => handleAction(p.case_id, 'SEND_REMINDER')}
                              disabled={actionLoading === p.case_id + 'SEND_REMINDER'}
                              title="Dispatch payment reminder"
                              className="p-1 rounded-md bg-[#141A24] border border-[#252D3A] text-slate-300 hover:text-white transition-all cursor-pointer"
                            >
                              <Bell className="h-3 w-3" />
                            </button>
                          </>
                        ) : (
                          <button
                            onClick={() => handleAction(p.case_id, 'RESCHEDULE')}
                            disabled={actionLoading === p.case_id + 'RESCHEDULE'}
                            title="Re-open promise window"
                            className="px-2 py-1 rounded-md bg-[#141A24] border border-[#252D3A] text-indigo-400 hover:text-indigo-300 text-[10px] font-medium transition-all flex items-center gap-1 cursor-pointer"
                          >
                            <RotateCcw className="h-3 w-3" /> Reschedule
                          </button>
                        )}
                        {onSelectCase && (
                          <button
                            onClick={() => onSelectCase(p.case_id)}
                            className="px-2 py-1 rounded-md border border-[#252D3A] bg-[#141A24] text-slate-300 hover:text-white text-[10px] font-semibold transition-all cursor-pointer ml-1"
                          >
                            Trace →
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
      )}
    </div>
  );
};
