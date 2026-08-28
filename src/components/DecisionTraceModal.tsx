'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Activity, AlertTriangle, Check, CheckCircle2, ChevronRight, Clock3, Loader2, ShieldCheck, X, Zap, Circle, MessageSquare } from 'lucide-react';

type Trace = {
  case: Record<string, any>;
  audits: Array<Record<string, any>>;
  guardrailChecks: Record<string, any>;
  factors: Array<{ factor: string; impact: string; weight: number; description: string }>;
  candidatePlaybooks: Array<{ label: string; playbook: string; score: number; selected: boolean; available: boolean; reason: string }>;
  customerHistory: { segment: string; riskScore: number; retryCount: number; maxRetries: number; pastRecoverySignal: string };
  ledgerEntries: Array<Record<string, any>>;
  hinglishTranscript?: {
    channel: string;
    language: string;
    branch: string;
    turns: Array<{ speaker: string; message: string; state: string; timestamp: string }>;
    finalOutcome: string;
    paymentIntent: boolean;
  } | null;
  proof: { amountAtRisk: number; predictedRecoverable: number; verifiedRecovered: number; verificationSource: string };
  finalOutcome?: string;
  stageStory?: Array<{ stage: string; details: string }>;
  aiDecision: { riskScore: number; recoveryProbability: number; detectedIssue: string; diagnosis: string; selectedAction: string; confidence: string; confidencePercent: number; expectedOutcome: string; decisionFactors: Array<{ factor: string; signal: string; value: number; evidence: string }>; guardrailChecks: Array<{ name: string; status: string; value: string; reason: string }> };
};

const stages = [['DETECT', 'Revenue signal captured'], ['DIAGNOSE', 'Root cause classified'], ['DECIDE', 'Playbook selected'], ['GUARDRAIL', 'Autonomy policy checked'], ['ACT', 'Bounded action dispatched'], ['VERIFY', 'Settlement confirmed']] as const;
const money = (value: number) => `₹${Number(value || 0).toLocaleString('en-IN')}`;
const pretty = (value: string) => (value || '').replace(/_/g, ' ');
const formatAuditDetails = (value: string) => value.replace(/(\d+)\/(\d+)/g, (_, attempt, maximum) => {
  const used = Number(attempt); const limit = Number(maximum);
  return used > limit ? `retry limit exceeded (attempt ${used}; maximum ${limit})` : `${used} of ${limit}`;
});

function stageState(stage: string, trace: Trace) {
  const status = trace.case.status;
  if (stage === 'VERIFY') return status === 'RECOVERED' ? 'complete' : status === 'ESCALATED' ? 'blocked' : 'pending';
  if (stage === 'ACT') return trace.case.last_action || status === 'RECOVERED' || status === 'ACTION_IN_PROGRESS' ? 'complete' : 'pending';
  if (stage === 'GUARDRAIL') return trace.guardrailChecks.overallGuardrailPassed ? 'complete' : 'blocked';
  if (stage === 'DECIDE') return trace.case.playbook ? 'complete' : 'pending';
  if (stage === 'DIAGNOSE') return trace.case.diagnosis_summary ? 'complete' : 'pending';
  return 'complete';
}

function activeStage(trace: Trace): string {
  const status = trace.case.status;
  if (status === 'RECOVERED') return 'VERIFY';
  if (status === 'ESCALATED' || String(status).startsWith('STOPPED')) return trace.guardrailChecks.overallGuardrailPassed ? 'VERIFY' : 'GUARDRAIL';
  if (status === 'ACTION_IN_PROGRESS') return 'ACT';
  if (status === 'VERIFYING') return 'VERIFY';
  if (status === 'DECIDED') return 'DECIDE';
  if (status === 'DIAGNOSING') return 'DIAGNOSE';
  return 'DETECT';
}

export const DecisionTraceModal: React.FC<{ caseId: string | null; onClose: () => void; onRunAction: (id: string, forceApproval?: boolean) => Promise<void> | void; isProcessing: boolean }> = ({ caseId, onClose, onRunAction, isProcessing }) => {
  const [trace, setTrace] = useState<Trace | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    if (!caseId) return;
    setLoading(true); setError('');
    try { const response = await fetch(`/api/cases/${caseId}/trace`, { cache: 'no-store' }); const json = await response.json(); if (!response.ok) throw new Error(json.error || 'Unable to load case trace'); setTrace(json); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to load case trace'); }
    finally { setLoading(false); }
  }, [caseId]);
  useEffect(() => { load(); }, [load]);

  const handleRunAction = async () => {
    if (!c) return;
    await onRunAction(c.id, c.status === 'ESCALATED');
    // The action updates the authoritative server-side case, ledger, and audit
    // records. Reload the trace so the open modal reflects those same records.
    await load();
  };
  if (!caseId) return null;
  const c = trace?.case;
  const canAct = c && c.status !== 'RECOVERED' && !String(c.status).startsWith('STOPPED');
  const settlementVerified = Boolean(
    c?.status === 'RECOVERED' &&
    (trace?.proof.verifiedRecovered ?? 0) > 0 &&
    (trace?.ledgerEntries ?? []).some(entry => Number(entry.recovered_amount) > 0)
  );
  return <div className="fixed inset-0 z-50 overflow-y-auto bg-[#02050b]/85 p-3 backdrop-blur-md sm:p-6" onClick={event => event.target === event.currentTarget && onClose()}>
    <section className="mx-auto my-3 max-w-6xl overflow-hidden rounded-3xl border border-[#26374d] bg-[#0b111d]/95 shadow-[0_30px_100px_rgba(0,0,0,.65)] sm:my-8">
      <header className="flex items-start justify-between gap-4 border-b border-[#233149] bg-gradient-to-r from-[#101d31] to-[#0b111d] px-5 py-5 sm:px-8"><div className="flex gap-3"><div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl border border-blue-400/30 bg-blue-400/10 text-blue-300"><Activity /></div><div><p className="text-xs font-mono uppercase tracking-[.22em] text-blue-300">Automated Decision · Case Intelligence</p><h2 className="mt-1 text-xl font-extrabold text-white sm:text-2xl">CASE #{caseId}</h2>{c && <p className="mt-1 text-sm text-slate-400">{c.customer_name} · {pretty(c.playbook)} · {pretty(c.failure_reason)}</p>}</div></div><button onClick={onClose} aria-label="Close case intelligence" className="rounded-xl p-2 text-slate-400 hover:bg-white/5 hover:text-white"><X /></button></header>
      {loading && !c ? <TraceSkeleton /> : error ? <div className="p-10 text-center text-rose-300">{error}<button onClick={load} className="ml-3 text-blue-300 underline">Retry</button></div> : c && trace && <div className="max-h-[78vh] space-y-7 overflow-y-auto p-5 sm:p-8">
        <div className="grid gap-3 sm:grid-cols-4"><Stat label="Revenue at risk" value={money(c.amount)} tone="yellow" /><Stat label="Risk score" value={`${trace.aiDecision.riskScore} / 100`} tone="red" /><Stat label="Estimated recovery probability" value={`${trace.aiDecision.confidencePercent}% · ${trace.aiDecision.confidence}`} tone="purple" /><Stat label="Verified recovered" value={money(trace.proof.verifiedRecovered)} tone="green" /></div>
        <Panel title="Automated Decision" eyebrow="Diagnose → decide"><div className="grid gap-4 md:grid-cols-[1fr_auto]"><div><p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Detected issue</p><p className="mt-1 text-lg font-bold text-purple-200">{trace.aiDecision.detectedIssue}</p><p className="mt-3 text-sm leading-relaxed text-slate-300">{trace.aiDecision.diagnosis}</p></div><div className="rounded-2xl border border-purple-400/30 bg-purple-400/10 p-4 md:min-w-64"><p className="text-xs uppercase tracking-wider text-purple-200">Recommended playbook</p><p className="mt-2 text-lg font-extrabold text-white">{pretty(trace.aiDecision.selectedAction)}</p><p className="mt-2 text-sm font-semibold text-purple-100">{trace.aiDecision.confidencePercent}% confidence · {trace.aiDecision.confidence}</p><p className="mt-2 text-xs leading-relaxed text-slate-300">{trace.aiDecision.expectedOutcome}</p></div></div></Panel>
        <div className="rounded-2xl border border-blue-400/25 bg-[#0e1726] p-4 sm:p-6"><div className="mb-5 flex items-center justify-between"><div><p className="text-xs font-mono uppercase tracking-[.2em] text-blue-300">Recovery lifecycle</p><h3 className="mt-1 text-lg font-bold text-white">Revenue risk → verified recovery</h3></div><span className="rounded-full border border-blue-400/25 bg-blue-400/10 px-3 py-1 text-xs text-blue-200">Active: {activeStage(trace)}</span></div><div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-6">{stages.map(([key, label], index) => { const state = stageState(key, trace); const active = activeStage(trace) === key && state !== 'complete'; return <React.Fragment key={key}><div className={`rounded-xl border p-3 ${active ? 'border-blue-300/80 bg-blue-400/15 shadow-[0_0_18px_rgba(56,189,248,.18)]' : state === 'complete' ? 'border-emerald-400/40 bg-emerald-400/10' : state === 'blocked' ? 'border-purple-400/60 bg-purple-400/10' : 'border-slate-700 bg-slate-900/30'}`}><div className="flex items-center justify-between"><span className="text-[11px] font-mono font-bold text-slate-300">0{index + 1}</span>{active ? <Circle className="h-4 w-4 animate-pulse text-blue-300" /> : state === 'complete' ? <Check className="h-4 w-4 text-emerald-300" /> : state === 'blocked' ? <AlertTriangle className="h-4 w-4 text-purple-300" /> : <Clock3 className="h-4 w-4 text-slate-500" />}</div><p className="mt-3 text-xs font-bold uppercase tracking-wider text-white">{key}</p><p className="mt-1 text-xs leading-relaxed text-slate-400">{label}</p></div>{index < stages.length - 1 && <ChevronRight className="hidden self-center text-slate-600 lg:block" />}</React.Fragment>; })}</div></div>
        {trace.stageStory && <Panel title="Chronological Case Story" eyebrow="Backend-backed timeline"><div className="space-y-2">{trace.stageStory.map(entry => <div key={entry.stage} className="rounded-xl border border-[#26374d] bg-[#101927] p-3"><p className="text-[11px] font-mono uppercase tracking-[.18em] text-cyan-200">{entry.stage}</p><p className="mt-1 text-sm leading-relaxed text-slate-200">{entry.details}</p></div>)}</div></Panel>}
        <Panel title="Final Outcome" eyebrow="Terminal state"><div className="rounded-xl border border-[#26374d] bg-[#101927] p-4"><p className="text-xs uppercase tracking-wider text-slate-500">Outcome</p><p className={`mt-1 text-lg font-extrabold ${trace.finalOutcome === 'RECOVERED' ? 'text-emerald-300' : trace.finalOutcome === 'ESCALATED' ? 'text-amber-300' : trace.finalOutcome === 'STOPPED' ? 'text-rose-300' : 'text-slate-300'}`}>{trace.finalOutcome || c.status}</p></div></Panel>
        <div className="rounded-2xl border border-cyan-400/25 bg-cyan-400/5 p-4 sm:p-5"><div className="mb-4 flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-cyan-300" /><div><p className="text-xs font-mono uppercase tracking-[.18em] text-cyan-300">Settlement verification chain</p><h3 className="text-base font-bold text-white">Execution is not recovery</h3></div></div><div className="grid gap-2 text-center text-xs font-semibold sm:grid-cols-5"><VerificationStep label="Action executed" done={Boolean(c.last_action)} /><VerificationStep label="Provider response" done={Boolean(c.last_action_result)} /><VerificationStep label="Settlement verified" done={settlementVerified} /><VerificationStep label="Amount recovered" done={settlementVerified && trace.proof.verifiedRecovered > 0} /><VerificationStep label="Ledger entry created" done={trace.ledgerEntries.length > 0} /></div></div>
        {trace.hinglishTranscript && <Panel title="Simulated Voice/WhatsApp Recovery — Preview" eyebrow="Preview only · deterministic state machine"><div className="rounded-xl border border-pink-400/20 bg-pink-400/5 p-4"><div className="mb-3 flex flex-wrap items-center gap-2 text-pink-200 text-xs"><MessageSquare className="h-4 w-4" /><span className="rounded-full border border-pink-400/30 px-2 py-0.5 font-bold tracking-wider">SIMULATED</span><span className="rounded-full border border-pink-400/30 px-2 py-0.5 font-bold tracking-wider">{trace.hinglishTranscript.channel}</span><span className="rounded-full border border-pink-400/30 px-2 py-0.5 font-bold tracking-wider">{trace.hinglishTranscript.language}</span><span className="rounded-full border border-pink-400/30 px-2 py-0.5 font-bold tracking-wider">{trace.hinglishTranscript.branch}</span></div><div className="space-y-3">{trace.hinglishTranscript.turns.map((turn) => <div key={`${turn.state}-${turn.timestamp}`} className="rounded-lg border border-[#26374d] bg-[#101927] p-3"><div className="flex items-center justify-between gap-3 text-[11px] uppercase tracking-[.18em] text-slate-500"><span>{turn.speaker}</span><span>{turn.state}</span></div><p className="mt-2 text-sm leading-relaxed text-slate-200">{turn.message}</p><p className="mt-2 text-[11px] text-slate-500">{new Date(turn.timestamp).toLocaleString('en-IN')}</p></div>)}</div><p className="mt-3 text-[11px] leading-relaxed text-slate-500">Preview only. This prototype does not place live calls or perform speech recognition.</p></div></Panel>}
        <div className="grid gap-5 lg:grid-cols-[1.15fr_.85fr]"><div className="space-y-5"><Panel title="Candidate Playbooks" eyebrow="Why this action?"><div className="space-y-2">{trace.candidatePlaybooks.map(candidate => <div key={candidate.label} className={`rounded-xl border p-3 ${candidate.selected ? 'border-purple-400/60 bg-purple-400/10' : 'border-[#26374d] bg-[#101927]'}`}><div className="flex items-center gap-3"><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-white">{candidate.label}</p><p className="mt-1 text-xs text-slate-400">{candidate.reason || (candidate.available ? 'Supported by the selected recovery playbook.' : 'Unavailable under current case state.')}</p></div><strong className="font-mono text-purple-200">{candidate.score}%</strong>{candidate.selected && <span className="rounded-full bg-purple-400/15 px-2 py-1 text-[10px] font-bold text-purple-200">SELECTED</span>}</div></div>)}</div><div className="mt-4 rounded-xl border border-purple-400/20 bg-purple-400/5 p-4"><p className="text-xs font-bold uppercase tracking-wider text-purple-200">Why did the engine choose this?</p><p className="mt-2 text-sm leading-relaxed text-slate-300">{trace.aiDecision.expectedOutcome} {trace.aiDecision.diagnosis}</p></div></Panel><Panel title="Decision factors" eyebrow="Structured explainability"><div className="space-y-3">{trace.aiDecision.decisionFactors.map(factor => <div key={factor.factor} className="rounded-xl border border-[#26374d] bg-[#101927] p-3"><div className="flex items-center justify-between gap-2"><span className="text-sm font-semibold text-white">{factor.factor}</span><span className={`text-xs font-bold ${factor.signal === 'NEGATIVE' ? 'text-rose-300' : factor.signal === 'POSITIVE' ? 'text-emerald-300' : 'text-slate-400'}`}>{factor.signal}</span></div><div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-800"><div className={`h-full rounded-full ${factor.signal === 'NEGATIVE' ? 'bg-rose-400' : factor.signal === 'POSITIVE' ? 'bg-emerald-400' : 'bg-slate-500'}`} style={{ width: `${factor.factor === 'Amount threshold' ? Math.min(100, factor.value / 1000) : Math.min(100, Math.max(12, factor.value))}%` }} /></div><p className="mt-1 text-xs leading-relaxed text-slate-400">{factor.evidence}</p></div>)}</div></Panel></div>
          <div className="space-y-5"><Panel title="Guardrails evaluated" eyebrow="Autonomy boundary">{trace.aiDecision.guardrailChecks.map(check => <Guard key={check.name} label={check.name} value={`${check.value} · ${check.reason}`} passed={check.status === 'PASS'} status={check.status} />)}</Panel><Panel title="Customer & payment history" eyebrow="Context used by the rules engine"><Info label="Customer" value={`${c.customer_name} · ${trace.customerHistory.segment}`} /><Info label="Risk score" value={`${trace.customerHistory.riskScore}/100`} /><Info label="Attempts" value={`${trace.customerHistory.retryCount} of ${trace.customerHistory.maxRetries}`} /><Info label="Failure signal" value={pretty(c.failure_reason)} /><Info label="History signal" value={trace.customerHistory.pastRecoverySignal} /></Panel><Panel title="Settlement proof" eyebrow={settlementVerified ? 'SETTLEMENT VERIFIED' : 'PENDING / NOT RECOVERED'}><Info label="Provider / verification" value={trace.proof.verificationSource} /><Info label="Predicted recovery" value={money(trace.proof.predictedRecoverable)} /><Info label="Verified amount" value={money(trace.proof.verifiedRecovered)} /><Info label="Ledger entries" value={String(trace.ledgerEntries.length)} />{trace.ledgerEntries.map(entry => <div key={entry.id} className="mt-3 rounded-xl border border-emerald-400/20 bg-emerald-400/5 p-3 text-xs text-slate-300"><span className="font-mono text-emerald-200">{entry.id}</span><span className="mx-2 text-slate-600">·</span>{money(entry.recovered_amount)} verified {new Date(entry.verified_at).toLocaleString('en-IN')}</div>)}</Panel></div></div>
        <Panel title="Audit trail" eyebrow="Compliance record"><div className="space-y-2">{trace.audits.map(audit => <div key={audit.id} className="grid gap-1 rounded-xl border border-[#26374d] bg-[#101927] p-3 sm:grid-cols-[130px_120px_1fr_auto]"><span className="text-xs font-mono text-slate-500">{new Date(audit.timestamp).toLocaleTimeString('en-IN')}</span><span className="text-xs font-bold text-cyan-200">{pretty(audit.stage)}</span><span className="text-sm text-slate-300">{formatAuditDetails(audit.details)}</span><span className="text-xs font-semibold text-emerald-300">{audit.result}</span></div>)}</div></Panel>
      </div>}
      <footer className="flex flex-col items-stretch gap-3 border-t border-[#233149] bg-[#0a101a] px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-8"><div className="space-y-1"><div className="flex items-center gap-2 text-xs text-slate-400"><ShieldCheck className="h-4 w-4 text-cyan-300" /> Backend trace · settlement-backed ledger</div><p className="max-w-2xl text-[11px] leading-relaxed text-slate-500"><span className="font-semibold text-slate-400">Decision layer:</span> Diagnosis and playbook ranking use a deterministic decision engine in this prototype. Guardrail checks are separately deterministic rule evaluation. No live model call is made per case in this build. <span className="font-semibold text-slate-400">Guardrails:</span> retry limits, cooldowns, thresholds, and duplicate-action protection authorize or reject bounded execution.</p></div>{c && canAct && <button onClick={handleRunAction} disabled={isProcessing} className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-blue-500 disabled:opacity-50">{isProcessing ? <Loader2 className="animate-spin" /> : <Zap />} {c.status === 'ESCALATED' ? 'Authorize & execute' : 'Execute recovery'}</button>}</footer>
    </section>
  </div>;
};

function Stat({ label, value, tone }: { label: string; value: string; tone: string }) { const tones: Record<string, string> = { yellow: 'border-amber-400/25 bg-amber-400/5', purple: 'border-purple-400/25 bg-purple-400/5', green: 'border-emerald-400/25 bg-emerald-400/5', red: 'border-rose-400/25 bg-rose-400/5', blue: 'border-blue-400/25 bg-blue-400/5' }; return <div className={`rounded-2xl border p-4 ${tones[tone] || tones.blue}`}><p className="text-xs font-semibold uppercase tracking-wider text-slate-400">{label}</p><p className="mt-2 truncate text-xl font-extrabold text-white">{value}</p></div>; }
function Panel({ title, eyebrow, children }: { title: string; eyebrow: string; children: React.ReactNode }) { return <section className="rounded-2xl border border-[#26374d] bg-[#0e1726] p-4 sm:p-5"><p className="text-[11px] font-mono uppercase tracking-[.18em] text-slate-500">{eyebrow}</p><h3 className="mb-4 mt-1 text-base font-bold text-white">{title}</h3>{children}</section>; }
function Guard({ label, value, passed, status }: { label: string; value: string; passed: boolean; status?: string }) { const review = status === 'ESCALATE'; return <div className="flex items-center gap-3 border-b border-[#26374d] py-3 last:border-0"><div className={`grid h-7 w-7 place-items-center rounded-lg ${passed ? 'bg-emerald-400/15 text-emerald-300' : review ? 'bg-purple-400/15 text-purple-300' : 'bg-rose-400/15 text-rose-300'}`}>{passed ? <Check /> : review ? <AlertTriangle /> : <X />}</div><div className="min-w-0 flex-1"><p className="text-sm font-semibold text-white">{label}</p><p className="text-xs text-slate-400">{value}</p></div><span className={`text-xs font-bold ${passed ? 'text-emerald-300' : review ? 'text-purple-300' : 'text-rose-300'}`}>{status || (passed ? 'PASS' : 'BLOCK')}</span></div>; }
function VerificationStep({ label, done }: { label: string; done: boolean }) { return <div className={`rounded-xl border p-3 ${done ? 'border-emerald-400/35 bg-emerald-400/10 text-emerald-200' : 'border-slate-700 bg-slate-900/30 text-slate-500'}`}><div className="mb-1 flex justify-center">{done ? <CheckCircle2 className="h-4 w-4" /> : <Clock3 className="h-4 w-4" />}</div>{label}</div>; }
function TraceSkeleton() { return <div className="max-h-[78vh] space-y-6 overflow-hidden p-5 sm:p-8 animate-pulse"><div className="grid gap-3 sm:grid-cols-4">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-24 rounded-2xl bg-slate-800/70" />)}</div>{Array.from({ length: 4 }).map((_, i) => <div key={i} className={`rounded-2xl bg-slate-800/60 ${i === 0 ? 'h-36' : 'h-28'}`} />)}</div>; }
function Info({ label, value }: { label: string; value: string }) { return <div className="flex items-start justify-between gap-4 border-b border-[#26374d] py-2.5 last:border-0"><span className="text-xs text-slate-500">{label}</span><span className="max-w-[65%] text-right text-sm text-slate-200">{value}</span></div>; }
