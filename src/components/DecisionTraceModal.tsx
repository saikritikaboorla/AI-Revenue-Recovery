'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  X,
  RefreshCw,
  Zap,
  Activity,
  Clock,
  CheckCircle2,
  AlertTriangle,
  ShieldAlert,
  ShieldCheck,
  Loader2,
  TrendingUp,
  TrendingDown,
  Minus,
  ChevronRight,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface DecisionFactor {
  factor: string;
  impact: 'POSITIVE' | 'NEGATIVE' | 'NEUTRAL';
  weight: number; // 0–100
  description: string;
}

interface AuditRecord {
  id: string;
  case_id: string;
  timestamp: string;
  stage: string;
  actor: string;
  action: string;
  result: 'SUCCESS' | 'FAILED' | 'ESCALATED' | 'BLOCKED';
  details: string;
}

interface CaseRecord {
  id: string;
  customer_name: string;
  customer_email?: string;
  customer_segment: string;
  customer_risk_score: number;
  amount: number;
  currency: string;
  playbook: string;
  failure_reason: string;
  status: string;
  current_step: string;
  recovery_confidence: number;
  recovered_amount?: number;
  retry_count: number;
  max_retries: number;
  diagnosis_summary?: string;
  rationale?: string;
  last_action?: string;
  last_action_result?: string;
  escalation_reason?: string;
  escalated_to?: string;
  requires_human_approval?: boolean;
  created_at: string;
  updated_at: string;
  recovered_at?: string;
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface DecisionTraceModalProps {
  caseId: string | null;
  onClose: () => void;
  onRunAction: (id: string, forceApproval?: boolean) => void;
  isProcessing: boolean;
}

// ─── Pipeline step definitions ────────────────────────────────────────────────

const PIPELINE_STEPS = [
  { key: 'DETECTED',       label: 'DETECTED',        short: 'Ingestion' },
  { key: 'DIAGNOSED',      label: 'DIAGNOSED',        short: 'Root Cause' },
  { key: 'DECIDED',        label: 'DECIDED',          short: 'Playbook' },
  { key: 'GUARDRAIL',      label: 'GUARDRAIL CHECK',  short: 'Guardrails' },
  { key: 'ACTION',         label: 'ACTION',           short: 'Intervention' },
  { key: 'VERIFICATION',   label: 'VERIFICATION',     short: 'Settlement' },
  { key: 'OUTCOME',        label: 'OUTCOME',          short: 'Outcome' },
] as const;

type StepKey = (typeof PIPELINE_STEPS)[number]['key'];

// Map a case status → which steps are "done" and which is current
function getStepCompletion(caseRecord: CaseRecord): {
  completedUpTo: number; // index of last completed step (0-based)
  timestamps: Partial<Record<StepKey, string>>;
  stepDetails: Partial<Record<StepKey, string>>;
} {
  const { status, created_at, updated_at, recovered_at } = caseRecord;
  const ts = (d?: string) => d || updated_at;

  const stepDetails: Partial<Record<StepKey, string>> = {
    DETECTED: `Failure event ingested: ${caseRecord.failure_reason}. ₹${(caseRecord.amount || 0).toLocaleString('en-IN')} at risk.`,
    DIAGNOSED: caseRecord.diagnosis_summary || `Root cause analysis completed. Risk score ${caseRecord.customer_risk_score}/100.`,
    DECIDED: caseRecord.rationale || `Playbook ${caseRecord.playbook.replace(/_/g, ' ')} selected. Confidence: ${caseRecord.recovery_confidence}%.`,
    GUARDRAIL: caseRecord.requires_human_approval
      ? `⚠ Human approval required. ${caseRecord.escalation_reason || 'Guardrail triggered.'}`
      : `✓ Guardrail checks passed. Retry ${caseRecord.retry_count}/${caseRecord.max_retries}. Risk within threshold.`,
    ACTION: caseRecord.last_action
      ? `Executed: ${caseRecord.last_action.replace(/_/g, ' ')}. ${caseRecord.last_action_result || ''}`
      : 'Bounded intervention dispatched via Razorpay rails.',
    VERIFICATION: status === 'RECOVERED'
      ? `✓ Razorpay webhook confirmed payment.captured. ₹${(caseRecord.recovered_amount || caseRecord.amount || 0).toLocaleString('en-IN')} settled.`
      : status === 'ESCALATED'
        ? `Escalated to ${caseRecord.escalated_to || 'Operations'}. Awaiting human resolution.`
        : 'Awaiting Razorpay webhook settlement callback.',
    OUTCOME: status === 'RECOVERED'
      ? `RECOVERED — ₹${(caseRecord.recovered_amount || caseRecord.amount || 0).toLocaleString('en-IN')} written to Recovery Ledger.`
      : status === 'ESCALATED'
        ? `ESCALATED — ${caseRecord.escalation_reason || 'Requires human review.'}`
        : 'IN PROGRESS — Workflow running.',
  };

  const timestamps: Partial<Record<StepKey, string>> = {
    DETECTED: created_at,
    DIAGNOSED: ts(),
    DECIDED: ts(),
    GUARDRAIL: ts(),
    ACTION: ts(),
    VERIFICATION: status === 'RECOVERED' ? (recovered_at || updated_at) : ts(),
    OUTCOME: status === 'RECOVERED' ? (recovered_at || updated_at) : ts(),
  };

  // Determine how far along the pipeline we are
  let completedUpTo = 0;
  if (status === 'DETECTED') completedUpTo = 0;
  else if (status === 'DIAGNOSING') completedUpTo = 1;
  else if (status === 'DECIDED') completedUpTo = 2;
  else if (status === 'ACTION_IN_PROGRESS') completedUpTo = 4;
  else if (status === 'RECOVERED') completedUpTo = 6;
  else if (status === 'ESCALATED') completedUpTo = 5; // verified step shown as escalated
  else completedUpTo = 3;

  return { completedUpTo, timestamps, stepDetails };
}

// ─── Derive synthetic decision factors from case data ─────────────────────────

function deriveFactors(rec: CaseRecord): DecisionFactor[] {
  const factors: DecisionFactor[] = [];

  // LTV / segment factor
  const isHighValue = rec.customer_segment === 'HIGH_LTV_VIP' || rec.customer_segment === 'ENTERPRISE';
  factors.push({
    factor: 'Customer Lifetime Value',
    impact: isHighValue ? 'POSITIVE' : 'NEUTRAL',
    weight: isHighValue ? 80 : 45,
    description: isHighValue
      ? `${rec.customer_segment} segment — high-priority recovery warrants aggressive intervention.`
      : `${rec.customer_segment} segment — standard recovery playbook applied.`,
  });

  // Risk score
  const riskImpact: DecisionFactor['impact'] =
    rec.customer_risk_score > 65 ? 'NEGATIVE' : rec.customer_risk_score < 35 ? 'POSITIVE' : 'NEUTRAL';
  factors.push({
    factor: 'Customer Risk Score',
    impact: riskImpact,
    weight: Math.round((100 - rec.customer_risk_score) * 0.9),
    description: `Risk score ${rec.customer_risk_score}/100. ${
      riskImpact === 'NEGATIVE'
        ? 'Elevated risk — requires human guardrail override for autonomous action.'
        : riskImpact === 'POSITIVE'
          ? 'Low risk — high probability of successful autonomous recovery.'
          : 'Moderate risk — autonomous action within guardrail bounds.'
    }`,
  });

  // Failure reason
  const transientFailures = ['BANK_DOWNTIME', 'NETWORK_DECLINE', 'AUTH_FAILED_OTP_TIMEOUT'];
  const isTransient = transientFailures.some(f => rec.failure_reason.includes(f));
  factors.push({
    factor: 'Failure Cause Classification',
    impact: isTransient ? 'POSITIVE' : 'NEUTRAL',
    weight: isTransient ? 75 : 50,
    description: isTransient
      ? `${rec.failure_reason} — transient infrastructure failure; retry recovery likely to succeed.`
      : `${rec.failure_reason} — non-transient failure; targeted intervention playbook activated.`,
  });

  // Retry capacity
  const retriesLeft = rec.max_retries - rec.retry_count;
  factors.push({
    factor: 'Retry Headroom',
    impact: retriesLeft > 1 ? 'POSITIVE' : retriesLeft === 1 ? 'NEUTRAL' : 'NEGATIVE',
    weight: Math.max(10, Math.round((retriesLeft / rec.max_retries) * 85)),
    description: `${retriesLeft} retry slot(s) remaining of ${rec.max_retries} allowed. ${
      retriesLeft === 0 ? 'Escalation imminent.' : 'Guardrail headroom available.'
    }`,
  });

  // Transaction amount
  const isHighAmount = rec.amount > 100000;
  factors.push({
    factor: 'Transaction Amount',
    impact: isHighAmount ? 'NEGATIVE' : 'POSITIVE',
    weight: isHighAmount ? 30 : 70,
    description: isHighAmount
      ? `₹${rec.amount.toLocaleString('en-IN')} exceeds high-value threshold — human approval layer activated.`
      : `₹${rec.amount.toLocaleString('en-IN')} within autonomous action ceiling.`,
  });

  return factors;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

const ImpactBadge: React.FC<{ impact: DecisionFactor['impact'] }> = ({ impact }) => {
  if (impact === 'POSITIVE') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-950/60 border border-emerald-500/40 text-emerald-400">
        <TrendingUp className="h-2.5 w-2.5" /> POSITIVE
      </span>
    );
  }
  if (impact === 'NEGATIVE') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-950/60 border border-rose-500/40 text-rose-400">
        <TrendingDown className="h-2.5 w-2.5" /> NEGATIVE
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-900 border border-slate-700 text-slate-400">
      <Minus className="h-2.5 w-2.5" /> NEUTRAL
    </span>
  );
};

const AuditStageBadge: React.FC<{ stage: string; result?: string }> = ({ stage, result }) => {
  const resultColor =
    result === 'SUCCESS'
      ? 'text-emerald-400 bg-emerald-950/50 border-emerald-500/30'
      : result === 'ESCALATED'
        ? 'text-amber-400 bg-amber-950/50 border-amber-500/30'
        : result === 'FAILED' || result === 'BLOCKED'
          ? 'text-rose-400 bg-rose-950/50 border-rose-500/30'
          : 'text-blue-400 bg-blue-950/50 border-blue-500/30';

  return (
    <span className={`inline-block px-1.5 py-0.5 rounded text-[9px] font-mono font-bold border ${resultColor}`}>
      {stage}
    </span>
  );
};

// ─── Main Component ───────────────────────────────────────────────────────────

export const DecisionTraceModal: React.FC<DecisionTraceModalProps> = ({
  caseId,
  onClose,
  onRunAction,
  isProcessing,
}) => {
  const [data, setData] = useState<{ case: CaseRecord; audits: AuditRecord[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchCaseDetail = useCallback(async () => {
    if (!caseId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/cases/${caseId}`);
      if (!res.ok) {
        setError(`Failed to load case (${res.status})`);
        return;
      }
      const json = await res.json();
      setData(json);
    } catch (err) {
      setError('Network error — unable to load case data.');
      console.error('DecisionTraceModal fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, [caseId]);

  useEffect(() => {
    fetchCaseDetail();
  }, [fetchCaseDetail]);

  if (!caseId) return null;

  const recCase = data?.case;
  const audits = data?.audits ?? [];

  // ── Lifecycle pipeline data ──────────────────────────────────────────────────
  const pipeline = recCase ? getStepCompletion(recCase) : null;
  const factors = recCase ? deriveFactors(recCase) : [];

  const outcomeStatus = recCase?.status;
  const isRecovered = outcomeStatus === 'RECOVERED';
  const isEscalated = outcomeStatus === 'ESCALATED';

  // ── Step circle styling ──────────────────────────────────────────────────────
  const getStepStyle = (stepIndex: number): { circle: string; connector: string; label: string } => {
    if (!pipeline) {
      return {
        circle: 'border border-[#252D3A] text-[#98A2B3] bg-[#141A24]',
        connector: 'bg-[#252D3A]',
        label: 'text-[#98A2B3]',
      };
    }

    const isOutcomeStep = stepIndex === 6;

    if (isOutcomeStep) {
      if (isRecovered) {
        return {
          circle: 'bg-emerald-600/30 border border-emerald-400/60 text-emerald-400 shadow-[0_0_10px_rgba(34,197,94,0.3)]',
          connector: 'bg-[#252D3A]',
          label: 'text-emerald-400',
        };
      }
      if (isEscalated) {
        return {
          circle: 'bg-amber-600/30 border border-amber-400/60 text-amber-400 shadow-[0_0_10px_rgba(245,158,11,0.3)]',
          connector: 'bg-[#252D3A]',
          label: 'text-amber-400',
        };
      }
      return {
        circle: 'bg-blue-600/20 border border-blue-500/40 text-blue-400',
        connector: 'bg-[#252D3A]',
        label: 'text-blue-400',
      };
    }

    if (stepIndex <= pipeline.completedUpTo) {
      return {
        circle: 'bg-blue-600 border border-blue-400 text-white shadow-[0_0_8px_rgba(59,130,246,0.4)]',
        connector: stepIndex < pipeline.completedUpTo ? 'bg-blue-600/60' : 'bg-[#252D3A]',
        label: 'text-[#F5F7FA]',
      };
    }

    return {
      circle: 'border border-[#252D3A] text-[#98A2B3] bg-[#141A24]',
      connector: 'bg-[#252D3A]',
      label: 'text-[#98A2B3]',
    };
  };

  // ── Status badge ─────────────────────────────────────────────────────────────
  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'RECOVERED':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-emerald-950/60 border border-emerald-500/40 text-emerald-400">
            <CheckCircle2 className="h-3 w-3" /> RECOVERED
          </span>
        );
      case 'ESCALATED':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-amber-950/60 border border-amber-500/40 text-amber-400">
            <AlertTriangle className="h-3 w-3" /> ESCALATED
          </span>
        );
      case 'ACTION_IN_PROGRESS':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-blue-950/60 border border-blue-500/40 text-blue-400 animate-pulse">
            <Loader2 className="h-3 w-3 animate-spin" /> IN PROGRESS
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-slate-900 border border-slate-700 text-slate-300">
            <Clock className="h-3 w-3" /> {(status || 'DETECTED').replace(/_/g, ' ')}
          </span>
        );
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/85 backdrop-blur-md p-4 overflow-y-auto"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="relative w-full max-w-4xl rounded-2xl border border-[#252D3A] bg-[#0E131F] shadow-2xl overflow-hidden my-8">

        {/* ── Header ─────────────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between border-b border-[#252D3A] px-6 py-4 bg-[#141A24]">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600/20 border border-blue-500/40 text-blue-400 shrink-0">
              <Activity className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-base font-bold text-[#F5F7FA] leading-tight">Decision Trace & Lifecycle Graph</h2>
                <span className="rounded bg-blue-500/20 border border-blue-500/40 px-2 py-0.5 text-xs font-mono text-blue-300 shrink-0">
                  {caseId}
                </span>
              </div>
              {recCase && (
                <p className="text-xs text-[#98A2B3] mt-0.5 truncate">
                  {recCase.customer_name}
                  {recCase.customer_email ? ` · ${recCase.customer_email}` : ''}
                  {' · '}
                  <span className="text-slate-400">{recCase.customer_segment.replace(/_/g, ' ')}</span>
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0 ml-3">
            <button
              onClick={fetchCaseDetail}
              disabled={loading}
              className="p-2 rounded-lg text-[#98A2B3] hover:bg-[#252D3A] hover:text-[#F5F7FA] transition-colors disabled:opacity-50"
              title="Refresh case data"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-lg text-[#98A2B3] hover:bg-[#252D3A] hover:text-[#F5F7FA] transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* ── Modal Body ─────────────────────────────────────────────────────── */}
        {loading && !recCase ? (
          <div className="p-12 flex flex-col items-center justify-center gap-3 text-slate-400">
            <Loader2 className="h-7 w-7 animate-spin text-blue-400" />
            <span className="text-xs">Loading case ledger &amp; decision graph…</span>
          </div>
        ) : error ? (
          <div className="p-12 flex flex-col items-center justify-center gap-3 text-rose-400">
            <ShieldAlert className="h-7 w-7" />
            <span className="text-xs">{error}</span>
            <button onClick={fetchCaseDetail} className="text-xs text-blue-400 hover:underline mt-1">
              Retry
            </button>
          </div>
        ) : recCase ? (
          <div className="p-6 space-y-6 max-h-[78vh] overflow-y-auto text-sm">

            {/* ── KPI Cards ───────────────────────────────────────────────────── */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {/* Amount at Risk */}
              <div className="rounded-xl border border-amber-500/20 bg-[#141A24] p-3.5">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-[#98A2B3]">Amount at Risk</span>
                <p className="text-xl font-extrabold text-amber-400 mt-1 leading-none">
                  ₹{(recCase.amount || 0).toLocaleString('en-IN')}
                </p>
                {isRecovered && (
                  <p className="text-[10px] text-emerald-400 font-semibold mt-0.5">
                    ₹{(recCase.recovered_amount || recCase.amount || 0).toLocaleString('en-IN')} recovered
                  </p>
                )}
              </div>

              {/* Playbook */}
              <div className="rounded-xl border border-[#252D3A] bg-[#141A24] p-3.5">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-[#98A2B3]">Playbook</span>
                <p className="text-xs font-bold text-[#F5F7FA] mt-1 leading-tight">
                  {(recCase.playbook || 'N/A').replace(/_/g, ' ')}
                </p>
                <p className="text-[10px] text-[#98A2B3] mt-0.5 truncate">
                  Retry {recCase.retry_count}/{recCase.max_retries}
                </p>
              </div>

              {/* Status */}
              <div className="rounded-xl border border-[#252D3A] bg-[#141A24] p-3.5">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-[#98A2B3]">Lifecycle Status</span>
                <div className="mt-1.5">{getStatusBadge(recCase.status)}</div>
                <p className="text-[10px] text-[#98A2B3] mt-1 truncate">{recCase.current_step?.replace(/_/g, ' ')}</p>
              </div>

              {/* Confidence */}
              <div className="rounded-xl border border-cyan-500/20 bg-[#141A24] p-3.5">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-[#98A2B3]">Confidence</span>
                <p className="text-xl font-extrabold text-cyan-400 mt-1 leading-none">
                  {recCase.recovery_confidence ?? 85}%
                </p>
                <div className="mt-1.5 h-1 rounded-full bg-slate-800 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-cyan-500 transition-all"
                    style={{ width: `${recCase.recovery_confidence ?? 85}%` }}
                  />
                </div>
              </div>
            </div>

            {/* ── Decision Factors ─────────────────────────────────────────────── */}
            <div className="rounded-xl border border-[#252D3A] bg-[#080B12] p-5">
              <h3 className="text-xs font-bold uppercase tracking-wider text-[#98A2B3] flex items-center gap-2 mb-4">
                <Zap className="h-3.5 w-3.5 text-blue-400" />
                AI Decision Factors — Explainability Matrix
              </h3>

              <div className="space-y-3">
                {factors.map((f, idx) => (
                  <div key={idx} className="rounded-lg border border-[#252D3A] bg-[#141A24] px-4 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2 mb-1.5">
                          <span className="text-xs font-semibold text-[#F5F7FA]">{f.factor}</span>
                          <ImpactBadge impact={f.impact} />
                        </div>
                        <p className="text-[11px] text-[#98A2B3] leading-relaxed">{f.description}</p>
                      </div>

                      {/* Weight bar */}
                      <div className="shrink-0 w-24 flex flex-col items-end gap-1">
                        <span className="text-[10px] font-mono text-slate-400">{f.weight}%</span>
                        <div className="w-full h-1.5 rounded-full bg-slate-800 overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${
                              f.impact === 'POSITIVE'
                                ? 'bg-emerald-500'
                                : f.impact === 'NEGATIVE'
                                  ? 'bg-rose-500'
                                  : 'bg-slate-500'
                            }`}
                            style={{ width: `${f.weight}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* ── Lifecycle Pipeline ────────────────────────────────────────────── */}
            <div className="rounded-xl border border-[#252D3A] bg-[#080B12] p-5">
              <h3 className="text-xs font-bold uppercase tracking-wider text-[#98A2B3] flex items-center gap-2 mb-6">
                <Activity className="h-3.5 w-3.5 text-blue-400" />
                Closed-Loop Execution Pipeline
              </h3>

              {/* Steps list */}
              <div className="space-y-0">
                {PIPELINE_STEPS.map((step, idx) => {
                  const style = getStepStyle(idx);
                  const isLast = idx === PIPELINE_STEPS.length - 1;
                  const ts = pipeline?.timestamps[step.key];
                  const detail = pipeline?.stepDetails[step.key];

                  // Special outcome rendering
                  const isOutcome = step.key === 'OUTCOME';

                  return (
                    <div key={step.key} className="flex gap-4">
                      {/* Circle + connector */}
                      <div className="flex flex-col items-center shrink-0">
                        <div
                          className={`h-7 w-7 rounded-full flex items-center justify-center text-[11px] font-bold transition-all ${style.circle}`}
                        >
                          {idx + 1}
                        </div>
                        {!isLast && (
                          <div className={`w-0.5 flex-1 min-h-[2rem] mt-1 mb-1 transition-colors ${style.connector}`} />
                        )}
                      </div>

                      {/* Content */}
                      <div className={`pb-5 flex-1 min-w-0 ${isLast ? '' : ''}`}>
                        <div className="flex flex-wrap items-center gap-2 mb-1">
                          <span className={`text-[11px] font-bold uppercase tracking-wide ${style.label}`}>
                            {step.label}
                          </span>
                          {isOutcome && (
                            <>
                              {isRecovered && (
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-950/60 border border-emerald-500/40 text-emerald-400">
                                  RECOVERED
                                </span>
                              )}
                              {isEscalated && (
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-950/60 border border-amber-500/40 text-amber-400">
                                  ESCALATED
                                </span>
                              )}
                              {!isRecovered && !isEscalated && (
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-950/60 border border-blue-500/40 text-blue-400 animate-pulse">
                                  IN PROGRESS
                                </span>
                              )}
                            </>
                          )}
                          {ts && (
                            <span className="text-[10px] font-mono text-[#98A2B3]">
                              {new Date(ts).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                            </span>
                          )}
                        </div>

                        {detail && (
                          <p className={`text-[11px] leading-relaxed rounded-lg px-3 py-2 border ${
                            isOutcome && isRecovered
                              ? 'text-emerald-300/90 bg-emerald-950/20 border-emerald-500/20'
                              : isOutcome && isEscalated
                                ? 'text-amber-300/90 bg-amber-950/20 border-amber-500/20'
                                : 'text-[#98A2B3] bg-[#141A24] border-[#252D3A]'
                          }`}>
                            {detail}
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* ── Guardrail Status ─────────────────────────────────────────────── */}
            <div className="rounded-xl border border-[#252D3A] bg-[#141A24] p-4">
              <h3 className="text-xs font-bold uppercase tracking-wider text-[#98A2B3] flex items-center gap-2 mb-3">
                <ShieldCheck className="h-3.5 w-3.5 text-blue-400" />
                Guardrail Compliance Summary
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {[
                  {
                    label: 'Retry Limit',
                    pass: recCase.retry_count < recCase.max_retries,
                    detail: `${recCase.retry_count}/${recCase.max_retries}`,
                  },
                  {
                    label: 'Risk Threshold',
                    pass: recCase.customer_risk_score <= 65,
                    detail: `Score: ${recCase.customer_risk_score}`,
                  },
                  {
                    label: 'Value Ceiling',
                    pass: recCase.amount <= 100000,
                    detail: `₹${(recCase.amount / 1000).toFixed(0)}k`,
                  },
                  {
                    label: 'Human Approval',
                    pass: !recCase.requires_human_approval,
                    detail: recCase.requires_human_approval ? 'Required' : 'Not needed',
                  },
                ].map((g) => (
                  <div
                    key={g.label}
                    className={`rounded-lg border px-3 py-2 flex flex-col gap-0.5 ${
                      g.pass
                        ? 'border-emerald-500/20 bg-emerald-950/20'
                        : 'border-amber-500/20 bg-amber-950/20'
                    }`}
                  >
                    <span className="text-[10px] font-semibold text-[#98A2B3]">{g.label}</span>
                    <div className="flex items-center gap-1">
                      {g.pass ? (
                        <CheckCircle2 className="h-3 w-3 text-emerald-400 shrink-0" />
                      ) : (
                        <AlertTriangle className="h-3 w-3 text-amber-400 shrink-0" />
                      )}
                      <span className={`text-[10px] font-mono ${g.pass ? 'text-emerald-400' : 'text-amber-400'}`}>
                        {g.detail}
                      </span>
                    </div>
                  </div>
                ))}
              </div>

              {isEscalated && recCase.escalation_reason && (
                <div className="mt-3 rounded-lg border border-amber-500/30 bg-amber-950/20 px-3 py-2.5">
                  <p className="text-[11px] text-amber-300">
                    <span className="font-bold">Escalation Reason: </span>
                    {recCase.escalation_reason}
                  </p>
                  {recCase.escalated_to && (
                    <p className="text-[10px] text-amber-400/70 mt-0.5">
                      Assigned to: <span className="font-semibold">{recCase.escalated_to}</span>
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* ── Audit Log Timeline ───────────────────────────────────────────── */}
            <div className="rounded-xl border border-[#252D3A] bg-[#141A24] p-4">
              <h4 className="text-xs font-bold uppercase tracking-wider text-[#F5F7FA] mb-3 flex items-center gap-2">
                <Clock className="h-3.5 w-3.5 text-blue-400" />
                Immutable Audit Events
                <span className="ml-1 px-1.5 py-0.5 rounded bg-[#252D3A] text-blue-300 font-mono text-[10px]">
                  {audits.length}
                </span>
              </h4>

              {audits.length === 0 ? (
                <p className="text-xs text-[#98A2B3] italic py-4 text-center">No audit events recorded yet.</p>
              ) : (
                <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
                  {audits.map((a) => (
                    <div
                      key={a.id}
                      className="flex flex-col sm:flex-row sm:items-start gap-2 rounded-lg border border-[#252D3A] bg-[#080B12] px-3 py-2.5"
                    >
                      <div className="flex items-center gap-2 shrink-0">
                        <AuditStageBadge stage={a.stage} result={a.result} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[11px] text-slate-300 leading-relaxed">{a.details}</p>
                        <div className="flex flex-wrap gap-2 mt-1">
                          <span className="text-[9px] text-[#98A2B3] font-mono">{a.actor}</span>
                          {a.action && (
                            <>
                              <ChevronRight className="h-2.5 w-2.5 text-[#252D3A] mt-px" />
                              <span className="text-[9px] text-blue-400/80 font-mono">{a.action}</span>
                            </>
                          )}
                        </div>
                      </div>
                      <span className="text-[9px] text-[#98A2B3] font-mono shrink-0 self-start sm:self-center">
                        {a.timestamp ? new Date(a.timestamp).toLocaleTimeString('en-IN') : '—'}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

          </div>
        ) : null}

        {/* ── Footer ─────────────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between border-t border-[#252D3A] px-6 py-4 bg-[#141A24] gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-[#98A2B3] hover:text-[#F5F7FA] transition-colors rounded-lg hover:bg-[#252D3A]"
          >
            Close
          </button>

          {recCase && !isRecovered && (
            <button
              onClick={() => {
                onRunAction(recCase.id, isEscalated);
                // auto-refresh after the action completes
                setTimeout(() => fetchCaseDetail(), 900);
              }}
              disabled={isProcessing}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-lg text-xs font-bold text-white transition-all disabled:opacity-50 ${
                isEscalated
                  ? 'bg-amber-600 hover:bg-amber-500 shadow-[0_0_15px_rgba(245,158,11,0.3)]'
                  : 'bg-blue-600 hover:bg-blue-500 shadow-[0_0_15px_rgba(59,130,246,0.35)]'
              }`}
            >
              {isProcessing ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Running Pipeline…
                </>
              ) : isEscalated ? (
                <>
                  <ShieldCheck className="h-4 w-4" />
                  Authorize &amp; Execute
                </>
              ) : (
                <>
                  <Zap className="h-4 w-4" />
                  Execute Recovery
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
