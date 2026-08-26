"use client";

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Navbar } from '@/components/Navbar';
import { MetricsOverview } from '@/components/MetricsOverview';
import { RecoveryCharts } from '@/components/charts/RecoveryCharts';
import { RecoveryQueue } from '@/components/RecoveryQueue';
import { SimulationRunner } from '@/components/SimulationRunner';
import { DecisionTraceModal } from '@/components/DecisionTraceModal';
import { GuardrailSettingsView } from '@/components/GuardrailSettingsView';
import { AuditTrailView } from '@/components/AuditTrailView';
import { EscalationsView } from '@/components/EscalationsView';
import { PromiseToPay } from '@/components/PromiseToPay';
import {
  ShieldCheck,
  RefreshCw,
  BarChart3,
  PlayCircle,
  History,
  AlertTriangle,
  Radio,
  HandCoins,
  CheckCircle2,
  XCircle,
} from 'lucide-react';

// ─── Tab types ────────────────────────────────────────────────────────────────

type TabId = 'overview' | 'queue' | 'analytics' | 'simulation' | 'escalations' | 'promises' | 'audit' | 'guardrails';

const TABS: { id: TabId; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'queue',       label: 'Recovery Queue',          icon: Radio },
  { id: 'analytics',   label: 'Playbook Analytics',      icon: BarChart3 },
  { id: 'simulation',  label: 'Batch Simulator',         icon: PlayCircle },
  { id: 'escalations', label: 'Escalations & Approvals', icon: AlertTriangle },
  { id: 'promises',    label: 'Promise-to-Pay',          icon: HandCoins },
  { id: 'audit',       label: 'Immutable Audit Trail',   icon: History },
  { id: 'guardrails',  label: 'Guardrail Policy',        icon: ShieldCheck },
];

const VALID_TABS = new Set<string>(TABS.map(t => t.id));

const TAB_ACCENTS: Record<TabId, { label: string; color: string; glow: string }> = {
  overview: { label: 'Command Center', color: '#38bdf8', glow: 'rgba(56,189,248,.28)' },
  queue: { label: 'Recovery Queue', color: '#2dd4bf', glow: 'rgba(45,212,191,.25)' },
  analytics: { label: 'Analytics', color: '#818cf8', glow: 'rgba(129,140,248,.25)' },
  simulation: { label: 'Batch Simulator', color: '#22d3ee', glow: 'rgba(34,211,238,.25)' },
  escalations: { label: 'Escalations', color: '#c084fc', glow: 'rgba(192,132,252,.25)' },
  promises: { label: 'Promise-to-Pay', color: '#2dd4bf', glow: 'rgba(45,212,191,.25)' },
  audit: { label: 'Audit Ledger', color: '#94a3b8', glow: 'rgba(148,163,184,.20)' },
  guardrails: { label: 'Guardrails', color: '#fbbf24', glow: 'rgba(251,191,36,.22)' },
};

function readHashTab(): TabId {
  if (typeof window === 'undefined') return 'overview';
  const h = window.location.hash.replace('#', '');
  return h === 'overview' || h === ''
    ? 'overview'
    : VALID_TABS.has(h)
      ? (h as TabId)
      : 'overview';
}

// ─── Toast ────────────────────────────────────────────────────────────────────

interface ToastMsg {
  id: number;
  type: 'success' | 'error' | 'info';
  message: string;
}

let _toastCounter = 0;

function Toast({ toasts, onDismiss }: { toasts: ToastMsg[]; onDismiss: (id: number) => void }) {
  return (
    <div className="fixed bottom-6 right-6 z-[9999] flex flex-col gap-2 pointer-events-none">
      {toasts.map(t => (
        <div
          key={t.id}
          className={`pointer-events-auto flex items-center gap-3 px-4 py-3 rounded-xl border shadow-2xl text-sm font-semibold animate-fade-up max-w-sm ${
            t.type === 'success'
              ? 'bg-emerald-950/95 border-emerald-500/50 text-emerald-300'
              : t.type === 'error'
              ? 'bg-rose-950/95 border-rose-500/50 text-rose-300'
              : 'bg-[#141A24]/95 border-[#252D3A] text-[#F5F7FA]'
          }`}
        >
          {t.type === 'success' && <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />}
          {t.type === 'error'   && <XCircle className="h-4 w-4 shrink-0 text-rose-400" />}
          <span className="flex-1">{t.message}</span>
          <button
            onClick={() => onDismiss(t.id)}
            className="text-[#98A2B3] hover:text-white transition-colors ml-1"
          >×</button>
        </div>
      ))}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  // Start from the server-renderable overview, then apply the browser hash on mount.
  // This avoids a hydration mismatch on a direct refresh of /dashboard#queue.
  const [activeTab, setActiveTab] = useState<TabId>('overview');
  const [metrics, setMetrics] = useState<any>(null);
  const [cases, setCases] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(null);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [toasts, setToasts] = useState<ToastMsg[]>([]);

  // Guard against double-init in Strict Mode
  const fetchedRef = useRef(false);

  // ── Toast helpers ──────────────────────────────────────────────────────
  const addToast = useCallback((type: ToastMsg['type'], message: string) => {
    const id = ++_toastCounter;
    setToasts(prev => [...prev, { id, type, message }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4500);
  }, []);

  const dismissToast = useCallback((id: number) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  // ── Hash sync ──────────────────────────────────────────────────────────
  // Listen for hashchange events (fired by Navbar direct hash assignment)
  useEffect(() => {
    const onHash = () => {
      const tab = readHashTab();
      setActiveTab(tab);
    };
    window.addEventListener('hashchange', onHash);
    // Also sync once on mount in case SSR and client hash differ
    onHash();
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  // When a tab is clicked via the in-page tab bar
  const handleTabClick = useCallback((tabId: TabId) => {
    setActiveTab(tabId);
    // Update hash without triggering Next.js navigation (no remount)
    window.location.hash = tabId;
  }, []);

  // ── Data fetching ──────────────────────────────────────────────────────
  const fetchData = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const [mRes, cRes] = await Promise.all([
        fetch('/api/metrics'),
        fetch('/api/cases'),
      ]);
      if (!mRes.ok || !cRes.ok) throw new Error('API error');
      const mData = await mRes.json();
      const cData = await cRes.json();
      setMetrics(mData);
      setCases(cData.cases || []);
    } catch (err) {
      console.error('Failed to load dashboard data:', err);
      addToast('error', 'Failed to refresh data. Check your connection.');
    } finally {
      setLoading(false);
    }
  }, [addToast]);

  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    fetchData();
  }, [fetchData]);

  // ── Execute Recovery ──────────────────────────────────────────────────
  const handleRunWorkflow = useCallback(async (caseId: string, forceApproval?: boolean) => {
    setProcessingId(caseId);
    try {
      const res = await fetch(`/api/cases/${caseId}/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ forceApproval }),
      });
      const data = await res.json();

      if (!res.ok) {
        addToast('error', data?.error || `Recovery action failed for ${caseId}`);
      } else if (data?.recovered) {
        addToast('success', `✓ Recovery successful — ₹${Number(data.case?.recovered_amount || 0).toLocaleString('en-IN')} recovered for ${caseId}`);
      } else if (data?.escalated) {
        addToast('info', `↑ Case ${caseId} escalated for human approval`);
      } else {
        addToast('info', `Case ${caseId} processed — ${data?.reason || 'check queue for status'}`);
      }

      // Refresh data silently
      await fetchData(true);
    } catch (err) {
      console.error('Workflow error:', err);
      addToast('error', `Network error executing recovery for ${caseId}`);
    } finally {
      setProcessingId(null);
    }
  }, [addToast, fetchData]);

  // ── Sync ledger (manual refresh) ──────────────────────────────────────
  const handleSyncLedger = useCallback(async () => {
    await fetchData();
    addToast('success', 'Ledger synced — all metrics refreshed');
  }, [fetchData, addToast]);

  // ── After simulation completes, refresh data ──────────────────────────
  const handleSimulationComplete = useCallback(async () => {
    await fetchData(true);
  }, [fetchData]);

  const accent = TAB_ACCENTS[activeTab];

  return (
    <main
      className="min-h-screen text-[#F5F7FA] selection:bg-blue-500 selection:text-white"
      style={{ '--section-accent': accent.color, '--section-glow': accent.glow } as React.CSSProperties}
    >
      <Navbar />

      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8 space-y-8">

        {/* ── Dashboard Header ──────────────────────────────────────────── */}
        <div className="command-header flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[#252D3A] pb-6">
          <div>
            <div className="flex items-center gap-2.5">
              <div className="h-3 w-3 rounded-full animate-pulse" style={{ backgroundColor: accent.color, boxShadow: `0 0 14px ${accent.glow}` }} />
              <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-[#F5F7FA]">
                AI Revenue Recovery Command Center
              </h1>
            </div>
            <p className="text-sm sm:text-base text-[#98A2B3] mt-2">
              Autonomous Closed-Loop Engine: Detect → Diagnose → Decide → Act → Verify → Stop
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-950/50 border border-emerald-500/25 text-emerald-400">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400" />
              </span>
              <span className="text-[10px] font-mono font-medium">Agent Engine Live</span>
            </div>
            <button
              onClick={handleSyncLedger}
              className="flex items-center gap-2 px-3 py-2 rounded-lg border border-[#252D3A] bg-[#141A24] text-xs font-semibold text-[#98A2B3] hover:text-[#F5F7FA] hover:border-slate-600 transition-all cursor-pointer"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
              Sync Ledger
            </button>
          </div>
        </div>

        {/* ── Metrics Overview ──────────────────────────────────────────── */}
        <MetricsOverview metrics={metrics} loading={loading} />

        {/* ── Tab Bar ───────────────────────────────────────────────────── */}
        <div className="module-tabs flex flex-wrap gap-2 border-b border-[#252D3A] pb-3" aria-label="Command center modules">
          {TABS.map((t) => {
            const Icon = t.icon;
            const isActive = activeTab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => handleTabClick(t.id)}
                className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold rounded-xl transition-all cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 ${
                  isActive
                    ? 'module-tab-active border shadow-[0_0_15px_var(--section-glow)]'
                    : 'text-[#98A2B3] hover:text-[#F5F7FA] hover:bg-[#141A24] border border-transparent'
                }`}
              >
                <Icon className="h-4 w-4" />
                {t.label}
              </button>
            );
          })}
        </div>

        {/* ── Tab Content ───────────────────────────────────────────────── */}
        <div key={activeTab} className="module-content animate-fade-in" data-section={activeTab}>

          {activeTab === 'queue' && (
            <RecoveryQueue
              cases={cases}
              loading={loading}
              onSelectCase={setSelectedCaseId}
              onRunWorkflow={handleRunWorkflow}
              processingId={processingId}
              onRefresh={() => fetchData()}
            />
          )}

          {activeTab === 'analytics' && (
            <RecoveryCharts metrics={metrics} loading={loading} />
          )}

          {activeTab === 'simulation' && (
            <div className="space-y-6">
              <SimulationRunner onSimulationComplete={handleSimulationComplete} />
              <RecoveryQueue
                cases={cases}
                loading={loading}
                onSelectCase={setSelectedCaseId}
                onRunWorkflow={handleRunWorkflow}
                processingId={processingId}
                onRefresh={() => fetchData()}
              />
            </div>
          )}

          {activeTab === 'escalations' && (
            <EscalationsView onSelectCase={setSelectedCaseId} />
          )}

          {activeTab === 'promises' && (
            <PromiseToPay onSelectCase={setSelectedCaseId} />
          )}

          {activeTab === 'audit' && (
            <AuditTrailView />
          )}

          {activeTab === 'guardrails' && (
            <GuardrailSettingsView />
          )}

        </div>
      </div>

      {/* ── Decision Trace Modal ───────────────────────────────────────── */}
      {selectedCaseId && (
        <DecisionTraceModal
          caseId={selectedCaseId}
          onClose={() => setSelectedCaseId(null)}
          onRunAction={handleRunWorkflow}
          isProcessing={processingId === selectedCaseId}
        />
      )}

      {/* ── Toast Notifications ────────────────────────────────────────── */}
      <Toast toasts={toasts} onDismiss={dismissToast} />
    </main>
  );
}
