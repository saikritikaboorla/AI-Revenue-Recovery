"use client";

import React, { useState, useEffect } from 'react';
import { AlertTriangle, UserCheck, ShieldAlert, ArrowUpRight, Check, X, RefreshCw } from 'lucide-react';
import { fetchWithTimeout } from '@/lib/fetch-with-timeout';

interface EscalationsViewProps {
  onSelectCase: (caseId: string) => void;
}

export const EscalationsView: React.FC<EscalationsViewProps> = ({ onSelectCase }) => {
  const [escalations, setEscalations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const fetchEscalations = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchWithTimeout('/api/escalations', {}, 10000);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setEscalations(data.escalations || []);
    } catch (err) {
      console.error('Failed to load escalations:', err);
      setError('Unable to load escalation records. Please refresh or retry.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEscalations();
  }, []);

  const handleDecision = async (caseId: string, action: 'APPROVE' | 'REJECT') => {
    setActionLoading(caseId + action);
    try {
      await fetchWithTimeout('/api/escalations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ caseId, action })
      }, 15000);
      await fetchEscalations();
    } catch (err) {
      console.error('Decision error:', err);
    } finally {
      setActionLoading(null);
    }
  };

  const pendingList = (escalations || []).filter(e => e && e.status === 'PENDING');

  return (
    <div className="rounded-xl border border-[#252D3A] bg-[#141A24] p-6 shadow-xl space-y-4">
      <div className="flex items-center justify-between border-b border-[#252D3A] pb-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-amber-600/20 text-amber-400 border border-amber-500/30">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <h3 className="text-base font-bold text-[#F5F7FA]">
              Human-in-the-Loop Escalation & Approval Queue
            </h3>
          </div>
          <p className="text-xs text-[#98A2B3] mt-1">
            Review high-value invoices, elevated risk cases, and retry limits requiring human manager sign-off.
          </p>
        </div>

        <span className="px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs font-bold">
          {pendingList.length} Pending Approval
        </span>
      </div>

      {loading ? (
        <div className="py-8 text-center text-xs text-slate-400 flex items-center justify-center gap-2">
          <RefreshCw className="h-4 w-4 animate-spin text-blue-400" />
          <span>Loading escalations...</span>
        </div>
      ) : error ? (
        <div className="flex flex-col items-center gap-3 py-8 text-center text-xs text-rose-300"><span>{error}</span><button onClick={fetchEscalations} className="rounded-lg border border-rose-500/40 px-3 py-1.5 font-semibold hover:bg-rose-950/30">Retry</button></div>
      ) : pendingList.length === 0 ? (
        <div className="py-8 text-center text-xs text-[#98A2B3]">
          No pending escalations. All transactions within autonomous guardrail boundaries.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {pendingList.map((e) => (
            <div
              key={e.id}
              className="rounded-xl border border-amber-500/30 bg-[#10151F] p-4 space-y-3"
            >
              <div className="flex items-center justify-between">
                <span className="font-mono font-bold text-amber-400 text-xs">{e.case_id}</span>
                <span className="text-xs font-bold text-[#F5F7FA]">₹{Number(e.amount || 0).toLocaleString('en-IN')}</span>
              </div>

              <div>
                <h4 className="text-sm font-semibold text-[#F5F7FA]">{e.customer_name}</h4>
                <p className="text-xs text-[#98A2B3]">Playbook: {(e.playbook || '').replace(/_/g, ' ')}</p>
              </div>

              <div className="rounded-lg bg-[#141A24] border border-[#252D3A] p-2.5 text-xs text-amber-300/90">
                <span className="font-semibold block text-slate-300 mb-0.5">Escalation Trigger:</span>
                {e.reason}
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-[#252D3A]">
                <button
                  onClick={() => onSelectCase(e.case_id)}
                  className="text-xs text-blue-400 hover:text-blue-300 font-semibold flex items-center gap-1 cursor-pointer"
                >
                  View Case Trace <ArrowUpRight className="h-3 w-3" />
                </button>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleDecision(e.case_id, 'REJECT')}
                    disabled={actionLoading === e.case_id + 'REJECT'}
                    className="px-3 py-1.5 rounded-lg border border-rose-500/40 bg-rose-950/40 text-rose-300 text-xs font-bold hover:bg-rose-900/60 transition-all flex items-center gap-1 cursor-pointer"
                  >
                    <X className="h-3 w-3" /> Reject
                  </button>
                  <button
                    onClick={() => handleDecision(e.case_id, 'APPROVE')}
                    disabled={actionLoading === e.case_id + 'APPROVE'}
                    className="px-3 py-1.5 rounded-lg border border-emerald-500/40 bg-emerald-950/40 text-emerald-300 text-xs font-bold hover:bg-emerald-900/60 transition-all flex items-center gap-1 cursor-pointer"
                  >
                    <Check className="h-3 w-3" /> Approve
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
