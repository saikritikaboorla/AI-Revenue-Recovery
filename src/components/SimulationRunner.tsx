'use client';

import React, { useState, useRef, useEffect } from 'react';
import {
  PlayCircle,
  CheckCircle2,
  Zap,
  RotateCcw,
  AlertTriangle,
  TrendingUp,
  Clock,
  BarChart3,
  Layers
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { fetchWithTimeout } from '@/lib/fetch-with-timeout';

// The /api/simulate endpoint returns a shape from RecoveryPipeline.runBatch
// which is slightly different from BatchSimulationResult in simulation-engine.
// We define a union-compatible type to handle both gracefully.
interface SimulateApiResult {
  batchId: string;
  totalProcessed?: number;
  totalCases?: number;
  totalCasesGenerated?: number;
  recoveredCount?: number;
  totalAtRisk?: number;
  totalValueAtRisk?: number;
  totalRecovered?: number;
  totalValueRecovered?: number;
  predictedRecoverableValue?: number;
  verifiedRecoveredValue?: number;
  recoveryRatePct: number;
  escalatedCount: number;
  failedCount?: number;
  playbookDistribution?: Record<string, number>;
  averageExecutionLatencyMs?: number;
  // Fields present on BatchSimulationResult
  totalRecoverableValue?: number;
  successfulRecoveriesCount?: number;
  stoppedCount?: number;
  decisionDistribution?: Record<string, number>;
  decisionFactors?: Record<string, number>;
  cases?: Array<{ id: string; customerName: string; amount: number; playbook: string; status: string; recoveredAmount: number; predictedRecoverable: number }>;
}

interface SimulationRunnerProps {
  onSimulationComplete: () => void;
  onResetState?: () => void;
}

const PRESET_SIZES = [10, 25, 50, 100] as const;

const PROGRESS_STEPS: { threshold: number; message: string }[] = [
  { threshold: 0,  message: 'Initializing batch engine...' },
  { threshold: 10, message: 'Creating cases...' },
  { threshold: 28, message: 'Running diagnostics...' },
  { threshold: 48, message: 'Executing recoveries...' },
  { threshold: 68, message: 'Verifying settlements...' },
  { threshold: 85, message: 'Compiling results...' },
  { threshold: 95, message: 'Finalizing batch report...' },
];

function getProgressMessage(progress: number): string {
  let message = PROGRESS_STEPS[0].message;
  for (const step of PROGRESS_STEPS) {
    if (progress >= step.threshold) {
      message = step.message;
    }
  }
  return message;
}

function formatINR(value: number): string {
  return `₹${value.toLocaleString('en-IN')}`;
}

export const SimulationRunner: React.FC<SimulationRunnerProps> = ({ onSimulationComplete, onResetState }) => {
  const [batchSize, setBatchSize] = useState<number>(10);
  const [customInput, setCustomInput] = useState<string>('10');
  const [isSimulating, setIsSimulating] = useState(false);
  const [lastResult, setLastResult] = useState<SimulateApiResult | null>(null);
  const [progress, setProgress] = useState<number>(0);
  const [progressMessage, setProgressMessage] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [resetMessage, setResetMessage] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Sync custom input with batchSize
  useEffect(() => {
    setCustomInput(String(batchSize));
  }, [batchSize]);

  const clearProgressInterval = () => {
    if (intervalRef.current !== null) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  };

  const startFakeProgress = () => {
    setProgress(0);
    setProgressMessage(getProgressMessage(0));

    intervalRef.current = setInterval(() => {
      setProgress(prev => {
        // Increment faster at start, slower toward 90%
        const increment = prev < 30 ? 3 : prev < 60 ? 2 : prev < 82 ? 1 : 0.4;
        const next = Math.min(prev + increment, 90);
        setProgressMessage(getProgressMessage(next));
        return next;
      });
    }, 200);
  };

  const finishProgress = () => {
    clearProgressInterval();
    setProgress(100);
    setProgressMessage('Batch complete!');
  };

  const runSimulation = async () => {
    if (isSimulating) return;
    setIsSimulating(true);
    setLastResult(null);
    setErrorMessage(null);
    setResetMessage(null);
    startFakeProgress();

    try {
      const res = await fetchWithTimeout('/api/simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ batchSize, autonomousAutoExecute: true })
      }, 30000);

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${await res.text()}`);
      }

      const data: SimulateApiResult = await res.json();
      finishProgress();
      setLastResult(data);
      onSimulationComplete();

      // Celebrate recovered revenue with confetti
      const recovered = data.totalRecovered ?? data.totalValueRecovered ?? 0;
      if (recovered > 0) {
        confetti({
          particleCount: 120,
          spread: 80,
          origin: { y: 0.55 },
          colors: ['#22C55E', '#3B82F6', '#06B6D4', '#F59E0B']
        });
        // Second burst
        setTimeout(() => {
          confetti({
            particleCount: 60,
            angle: 120,
            spread: 55,
            origin: { x: 0.85, y: 0.6 },
            colors: ['#22C55E', '#3B82F6', '#06B6D4']
          });
        }, 300);
      }
    } catch (err) {
      console.error('Simulation failed:', err);
      clearProgressInterval();
      setProgress(0);
      setProgressMessage('Simulation failed. Please retry.');
      setErrorMessage('The batch stopped before a complete report was returned. No partial result is shown as verified recovery. Please retry the simulation.');
    } finally {
      setIsSimulating(false);
    }
  };

  const resetData = async () => {
    setErrorMessage(null);
    setResetMessage(null);
    try {
      const response = await fetchWithTimeout('/api/cases', { method: 'DELETE' }, 10000);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      setLastResult(null);
      setProgress(0);
      setProgressMessage('');
      onSimulationComplete();
      onResetState?.();
      setResetMessage('Demo state reset: overview, analytics, escalations, promises, audit, and queue now reflect the seed state.');
    } catch (err) {
      console.error('Reset failed:', err);
      setErrorMessage('Unable to reset demo state. Please retry; no local result state was cleared.');
    }
  };

  const handleCustomInput = (raw: string) => {
    setCustomInput(raw);
    const parsed = parseInt(raw, 10);
    if (!isNaN(parsed) && parsed >= 2 && parsed <= 100) {
      setBatchSize(parsed);
    }
  };

  const handleCustomBlur = () => {
    const parsed = parseInt(customInput, 10);
    if (isNaN(parsed) || parsed < 2) {
      setBatchSize(2);
      setCustomInput('2');
    } else if (parsed > 100) {
      setBatchSize(100);
      setCustomInput('100');
    } else {
      setBatchSize(parsed);
      setCustomInput(String(parsed));
    }
  };

  // Derived result values normalising both API response shapes
  const atRisk      = lastResult ? (lastResult.totalAtRisk      ?? lastResult.totalValueAtRisk      ?? 0) : 0;
  const recovered   = lastResult ? (lastResult.totalRecovered   ?? lastResult.totalValueRecovered   ?? 0) : 0;
  const totalCases  = lastResult ? (lastResult.totalProcessed   ?? lastResult.totalCasesGenerated ?? lastResult.totalCases ?? 0) : 0;
  const latencyMs   = lastResult?.averageExecutionLatencyMs ?? null;
  const playbookDist = lastResult?.playbookDistribution ?? null;
  const predicted = lastResult ? (lastResult.predictedRecoverableValue ?? 0) : 0;
  const stopped = lastResult?.stoppedCount ?? 0;
  const successful = lastResult?.recoveredCount ?? 0;
  const escalated = lastResult?.escalatedCount ?? 0;
  const failed = lastResult?.failedCount ?? Math.max(0, totalCases - successful - escalated);
  const decisionDistribution = lastResult?.decisionDistribution ?? {};
  const decisionFactors = lastResult?.decisionFactors ?? {};

  return (
    <div className="rounded-xl border border-[#252D3A] bg-[#141A24] p-6 shadow-xl space-y-6">
      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#252D3A] pb-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-blue-600/20 text-blue-400 border border-blue-500/30">
              <PlayCircle className="h-5 w-5" />
            </div>
            <h3 className="text-base font-bold text-[#F5F7FA]">
              Batch Recovery Simulation &amp; Evaluation Engine
            </h3>
          </div>
          <p className="text-xs text-[#98A2B3] mt-1">
            Simulate realistic revenue-loss vectors at scale to evaluate recovery rate, guardrails, and measured runtime.
          </p>
        </div>

        <div className="flex items-center gap-3 flex-shrink-0">
          <button
            onClick={resetData}
            disabled={isSimulating}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[#252D3A] bg-[#10151F] text-xs font-semibold text-[#98A2B3] hover:text-[#F5F7FA] hover:border-slate-600 transition-all disabled:opacity-40"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Reset State
          </button>

          <button
            onClick={runSimulation}
            disabled={isSimulating}
            className="flex items-center gap-2 px-5 py-2 rounded-lg bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-xs font-bold transition-all shadow-[0_0_20px_rgba(59,130,246,0.4)] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Zap className="h-4 w-4" />
            {isSimulating
              ? `Running... (${batchSize} events)`
              : `Run Batch (${batchSize} Events)`}
          </button>
        </div>
      </div>

      {/* ── Batch Size Controls ── */}
      <div className="space-y-3 bg-[#10151F] p-4 rounded-lg border border-[#252D3A]">
        {/* Label row */}
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-[#F5F7FA] flex items-center gap-2">
            <Layers className="h-3.5 w-3.5 text-blue-400" />
            Batch Size
          </span>
          <span className="text-[11px] text-[#98A2B3]">Select a preset or enter a custom value (2–100)</span>
        </div>

        {/* Preset buttons */}
        <div className="flex items-center gap-2 flex-wrap">
          {PRESET_SIZES.map(size => (
            <button
              key={size}
              disabled={isSimulating}
              onClick={() => setBatchSize(size)}
              className={`
                px-4 py-1.5 rounded-lg text-xs font-bold border transition-all
                ${batchSize === size
                  ? 'border-blue-500/70 bg-blue-600/25 text-blue-300 shadow-[0_0_10px_rgba(59,130,246,0.25)]'
                  : 'border-[#252D3A] bg-[#141A24] text-[#98A2B3] hover:border-slate-500 hover:text-[#F5F7FA]'}
                disabled:opacity-40 disabled:cursor-not-allowed
              `}
            >
              {size}
            </button>
          ))}

          {/* Separator */}
          <span className="text-[#252D3A] font-light select-none">|</span>

          {/* Custom numeric input */}
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] text-[#98A2B3]">Custom:</span>
            <input
              type="number"
              min={2}
              max={100}
              value={customInput}
              disabled={isSimulating}
              onChange={e => handleCustomInput(e.target.value)}
              onBlur={handleCustomBlur}
              className="w-16 text-center text-xs font-mono font-bold text-blue-300 bg-[#141A24] border border-[#252D3A] rounded-lg px-2 py-1 focus:outline-none focus:border-blue-500/60 focus:ring-1 focus:ring-blue-500/30 disabled:opacity-40"
            />
          </div>
        </div>

        {/* Custom range slider */}
        <div className="flex items-center gap-3">
          <span className="text-[10px] font-mono text-[#4B5563]">2</span>
          <input
            type="range"
            min={2}
            max={100}
            step={1}
            value={batchSize}
            disabled={isSimulating}
            onChange={e => setBatchSize(Number(e.target.value))}
            className="flex-1 accent-blue-500 disabled:opacity-40"
          />
          <span className="text-[10px] font-mono text-[#4B5563]">100</span>
        </div>
      </div>

      {/* ── Progress Bar (visible while simulating) ── */}
      {(isSimulating || (progress > 0 && progress < 100)) && (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-[#98A2B3] font-medium flex items-center gap-1.5">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
              {progressMessage}
            </span>
            <span className="font-mono text-blue-400">{Math.round(progress)}%</span>
          </div>
          <div className="w-full h-2 rounded-full bg-[#10151F] border border-[#252D3A] overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-blue-600 to-indigo-500 transition-all duration-300 ease-out"
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className="flex items-center gap-3 text-[10px] text-[#4B5563]">
            <span>Creating cases</span>
            <span className="text-[#252D3A]">→</span>
            <span>Diagnosing</span>
            <span className="text-[#252D3A]">→</span>
            <span>Executing recoveries</span>
            <span className="text-[#252D3A]">→</span>
            <span>Verifying settlements</span>
          </div>
        </div>
      )}

      {errorMessage && (
        <div role="alert" className="flex items-start gap-3 rounded-xl border border-rose-500/35 bg-rose-950/20 p-4 text-sm text-rose-200">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-400" />
          <span>{errorMessage}</span>
        </div>
      )}
      {resetMessage && (
        <div role="status" className="rounded-xl border border-cyan-500/25 bg-cyan-950/15 p-3 text-xs text-cyan-200">{resetMessage}</div>
      )}

      {/* ── Completion Progress Bar (briefly shown at 100%) ── */}
      {progress === 100 && !isSimulating && lastResult && (
        <div className="space-y-1">
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-emerald-400 font-semibold flex items-center gap-1.5">
              <CheckCircle2 className="h-3.5 w-3.5" />
              Batch complete!
            </span>
            <span className="font-mono text-emerald-400">100%</span>
          </div>
          <div className="w-full h-2 rounded-full bg-[#10151F] border border-emerald-500/30 overflow-hidden">
            <div className="h-full rounded-full bg-gradient-to-r from-emerald-600 to-green-500 w-full" />
          </div>
        </div>
      )}

      {/* ── Results Panel ── */}
      {lastResult && (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-950/10 p-5 space-y-5">
          {/* Result header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <span className="text-xs font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4" />
              Batch Execution Complete
              <span className="font-mono text-emerald-600/70">• {lastResult.batchId}</span>
            </span>
            <div className="flex items-center gap-3 text-[11px] text-[#98A2B3]">
              {totalCases > 0 && (
                <span className="flex items-center gap-1">
                  <BarChart3 className="h-3.5 w-3.5 text-blue-400" />
                  {totalCases} cases processed
                </span>
              )}
              {latencyMs !== null && (
                <span className="flex items-center gap-1 font-mono">
                  <Clock className="h-3.5 w-3.5 text-cyan-400" />
                  {latencyMs}ms avg latency
                </span>
              )}
            </div>
          </div>

          {/* Metric cards grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-3">
            {/* At Risk */}
            <div className="rounded-lg bg-[#10151F] border border-[#252D3A] p-3 space-y-0.5">
              <span className="text-[10px] uppercase tracking-wider text-[#98A2B3] flex items-center gap-1">
                <AlertTriangle className="h-3 w-3 text-amber-400" />
                At Risk
              </span>
              <p className="text-base font-bold text-amber-400">{formatINR(atRisk)}</p>
            </div>

            {/* Recovered */}
            <div className="rounded-lg bg-[#10151F] border border-emerald-900/40 p-3 space-y-0.5">
              <span className="text-[10px] uppercase tracking-wider text-[#98A2B3] flex items-center gap-1">
                <TrendingUp className="h-3 w-3 text-emerald-400" />
                Verified Recovered
              </span>
              <p className="text-base font-bold text-emerald-400">{formatINR(recovered)}</p>
            </div>

            <div className="rounded-lg bg-[#10151F] border border-purple-900/40 p-3 space-y-0.5">
              <span className="text-[10px] uppercase tracking-wider text-[#98A2B3]">Predicted Recoverable</span>
              <p className="text-base font-bold text-purple-300">{formatINR(predicted)}</p>
            </div>

            {/* Recovery Rate */}
            <div className="rounded-lg bg-[#10151F] border border-blue-900/40 p-3 space-y-0.5">
              <span className="text-[10px] uppercase tracking-wider text-[#98A2B3] flex items-center gap-1">
                <Zap className="h-3 w-3 text-blue-400" />
                Recovery Rate
              </span>
              <p className="text-base font-bold text-blue-400">{lastResult.recoveryRatePct}%</p>
            </div>

            {/* Escalations */}
            <div className="rounded-lg bg-[#10151F] border border-cyan-900/30 p-3 space-y-0.5">
              <span className="text-[10px] uppercase tracking-wider text-[#98A2B3] flex items-center gap-1">
                <AlertTriangle className="h-3 w-3 text-cyan-400" />
                Escalations
              </span>
              <p className="text-base font-bold text-purple-300">{escalated} cases</p>
            </div>
            <div className="rounded-lg bg-[#10151F] border border-rose-900/30 p-3 space-y-0.5">
              <span className="text-[10px] uppercase tracking-wider text-[#98A2B3]">Stopped</span>
              <p className="text-base font-bold text-rose-300">{stopped} cases</p>
            </div>
            <div className="rounded-lg bg-[#10151F] border border-rose-900/30 p-3 space-y-0.5">
              <span className="text-[10px] uppercase tracking-wider text-[#98A2B3]">Failed / unrecoverable</span>
              <p className="text-base font-bold text-rose-300">{failed} cases</p>
            </div>
          </div>

          {lastResult.cases && lastResult.cases.length > 0 && (
            <div className="rounded-xl border border-[#252D3A] bg-[#10151F] p-4">
              <h4 className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-[#98A2B3]">Underlying cases · action → settlement</h4>
              <div className="max-h-64 space-y-2 overflow-y-auto">{lastResult.cases.map(result => <div key={result.id} className="grid gap-1 rounded-lg border border-[#252D3A] bg-[#141A24] p-3 text-xs sm:grid-cols-[1.2fr_1fr_auto_auto]"><span className="font-mono text-cyan-300">{result.id}<span className="ml-2 font-sans text-slate-400">{result.customerName}</span></span><span className="text-slate-400">{result.playbook.replace(/_/g, ' ')}</span><span className={result.recoveredAmount > 0 ? 'text-emerald-300' : 'text-amber-300'}>{result.recoveredAmount > 0 ? `Verified ${formatINR(result.recoveredAmount)}` : result.status.replace(/_/g, ' ')}</span><span className="text-right text-purple-300">Forecast {formatINR(result.predictedRecoverable)}</span></div>)}</div>
            </div>
          )}

          {Object.keys(decisionDistribution).length > 0 && <div className="grid gap-4 lg:grid-cols-2"><div className="rounded-xl border border-purple-500/25 bg-purple-500/5 p-4"><h4 className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-purple-200">Automated decision distribution</h4><div className="space-y-2">{Object.entries(decisionDistribution).map(([decision, count]) => <div key={decision} className="flex items-center justify-between rounded-lg border border-purple-500/15 bg-[#10151F] px-3 py-2 text-xs"><span className="text-slate-300">{decision.replace(/_/g, ' ')}</span><strong className="font-mono text-purple-200">{count}</strong></div>)}</div></div><div className="rounded-xl border border-blue-500/25 bg-blue-500/5 p-4"><h4 className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-blue-200">Why? aggregate positive signals</h4><div className="space-y-2">{Object.entries(decisionFactors).map(([factor, count]) => <div key={factor} className="flex items-center justify-between rounded-lg border border-blue-500/15 bg-[#10151F] px-3 py-2 text-xs"><span className="text-slate-300">{factor}</span><span className="font-mono text-blue-200">{count}/{totalCases}</span></div>)}</div></div></div>}

          {/* Avg Latency full-width card (if not already shown in header) */}
          {latencyMs !== null && (
            <div className="rounded-lg bg-[#10151F] border border-[#252D3A] px-4 py-2.5 flex items-center justify-between">
              <span className="text-xs text-[#98A2B3] flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5 text-cyan-400" />
                Average Execution Latency
              </span>
              <span className="text-sm font-mono font-bold text-cyan-300">{latencyMs} ms / case</span>
            </div>
          )}

          {/* Per-playbook breakdown */}
          {playbookDist && Object.keys(playbookDist).length > 0 && (
            <div className="space-y-2">
              <h4 className="text-[11px] font-semibold uppercase tracking-wider text-[#98A2B3] flex items-center gap-1.5">
                <BarChart3 className="h-3.5 w-3.5 text-blue-400" />
                Playbook Distribution
              </h4>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {Object.entries(playbookDist).map(([playbook, count]) => (
                  <div
                    key={playbook}
                    className="rounded-lg bg-[#10151F] border border-[#252D3A] px-3 py-2 flex items-center justify-between"
                  >
                    <span className="text-[10px] text-[#98A2B3] font-medium truncate pr-2">
                      {playbook.replace(/_/g, ' ')}
                    </span>
                    <span className="text-xs font-bold font-mono text-blue-300 flex-shrink-0">
                      {count}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
