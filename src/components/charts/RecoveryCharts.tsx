"use client";

import React from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
  CartesianGrid,
  Legend,
  PieChart,
  Pie,
  LineChart,
  Line,
} from 'recharts';
import { BarChart3, TrendingUp, AlertTriangle, CheckCircle2, Clock, Activity, BrainCircuit, ChevronDown } from 'lucide-react';

interface RecoveryChartsProps {
  metrics: any;
  loading?: boolean;
}

const PLAYBOOK_COLORS: Record<string, string> = {
  PAYMENT_DEGRADATION:      '#3B82F6',
  CHECKOUT_ABANDONMENT:     '#06B6D4',
  FAILED_SUBSCRIPTION:      '#8B5CF6',
  B2B_OVERDUE_RECEIVABLES:  '#F59E0B',
  MANDATE_RETRY:            '#10B981',
  HINGLISH_RECOVERY:        '#EC4899',
  PROMISE_TO_PAY:           '#14B8A6',
};

const FALLBACK_COLORS = ['#3B82F6','#06B6D4','#8B5CF6','#F59E0B','#10B981','#EC4899','#14B8A6'];

function SkeletonChart({ height = 240 }: { height?: number }) {
  return (
    <div className="animate-pulse rounded-lg bg-[#10151F] border border-[#252D3A]" style={{ height }} />
  );
}

function SummaryCard({
  label, value, sub, valueColor, Icon, iconCls,
}: {
  label: string; value: string; sub: string;
  valueColor: string; Icon: any; iconCls: string;
}) {
  return (
    <div className="rounded-xl border border-[#252D3A] bg-[#10151F] p-4 flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-[10px] uppercase font-semibold tracking-wider text-[#98A2B3]">{label}</span>
        <Icon className={`h-4 w-4 ${iconCls}`} />
      </div>
      <p className={`text-2xl font-extrabold ${valueColor}`}>{value}</p>
      <p className="text-[10px] text-[#98A2B3]">{sub}</p>
    </div>
  );
}

function AIAnalysisSection({ playbookData, atRisk, recovered, rate, escalated, active, total, ledger }: { playbookData: Array<{ fullName: string; atRisk: number; recovered: number; rate: number; count: number }>; atRisk: number; recovered: number; rate: number; escalated: number; active: number; total: number; ledger: number }) {
  const largestExposure = playbookData.reduce((largest, current) => current.atRisk > largest.atRisk ? current : largest, { fullName: 'No playbook data', atRisk: 0, recovered: 0, rate: 0, count: 0 });
  const strongestPlaybook = playbookData.filter(item => item.count > 0).sort((a, b) => b.rate - a.rate)[0];
  const exposureShare = atRisk > 0 ? Math.round((largestExposure.atRisk / atRisk) * 100) : 0;
  const cards = [
    { title: 'Exposure concentration', label: 'AT-RISK ANALYSIS', color: 'amber', icon: AlertTriangle, summary: largestExposure.atRisk ? `${largestExposure.fullName} carries the largest exposure.` : 'Waiting for case data.', body: largestExposure.atRisk ? `${largestExposure.fullName} represents ${exposureShare}% of all revenue at risk (${money(largestExposure.atRisk)} across ${largestExposure.count} cases). This is the first playbook the agent should inspect for additional recoverable value.` : 'Run a batch or load cases to calculate exposure concentration from the backend metrics.' },
    { title: 'Verified recovery signal', label: 'SETTLEMENT ANALYSIS', color: 'emerald', icon: CheckCircle2, summary: `${money(recovered)} verified across ${ledger} ledger entries.`, body: `The recovery rate is ${rate.toFixed(1)}% of revenue at risk. This card uses only the recovery ledger total exposed by the metrics API; it does not treat predicted recovery as cash recovered.` },
    { title: 'Playbook performance', label: 'DECISION ANALYSIS', color: 'purple', icon: BrainCircuit, summary: strongestPlaybook ? `${strongestPlaybook.fullName} leads at ${strongestPlaybook.rate.toFixed(1)}%.` : 'No completed playbooks yet.', body: strongestPlaybook ? `Among playbooks with cases, ${strongestPlaybook.fullName} has the highest verified recovery rate (${strongestPlaybook.recovered.toLocaleString('en-IN')} recovered from ${strongestPlaybook.atRisk.toLocaleString('en-IN')} at risk). Rates are calculated from persisted case and ledger metrics.` : 'Once cases have verified outcomes, the strongest playbook is calculated from actual recovered amounts.' },
    { title: 'Human attention queue', label: 'GUARDRAIL ANALYSIS', color: 'red', icon: ShieldIcon, summary: `${escalated} escalated · ${active} active · ${total} total cases.`, body: escalated ? `${escalated} case${escalated === 1 ? '' : 's'} require human review under the current guardrail state. Active cases remain in the bounded workflow and are not counted as recovered until settlement verification.` : 'No cases are currently escalated. Active workflows remain subject to retry, risk, amount, cooldown, and stopping rules.' },
  ];
  const surfaces: Record<string, string> = { amber: 'border-amber-400/25 bg-amber-400/5 open:bg-amber-400/10', emerald: 'border-emerald-400/25 bg-emerald-400/5 open:bg-emerald-400/10', purple: 'border-purple-400/25 bg-purple-400/5 open:bg-purple-400/10', red: 'border-rose-400/25 bg-rose-400/5 open:bg-rose-400/10' };
  const accents: Record<string, string> = { amber: 'text-amber-300', emerald: 'text-emerald-300', purple: 'text-purple-300', red: 'text-rose-300' };
  return <section className="rounded-2xl border border-purple-500/25 bg-gradient-to-br from-purple-500/5 via-[#141A24] to-blue-500/5 p-5 shadow-[0_20px_45px_rgba(0,0,0,.18)]"><div className="mb-4 flex items-start gap-3"><div className="rounded-xl border border-purple-400/30 bg-purple-400/10 p-2 text-purple-200"><BrainCircuit className="h-5 w-5" /></div><div><p className="text-[11px] font-mono uppercase tracking-[.18em] text-purple-200">AI Analysis · Live metrics</p><h3 className="mt-1 text-lg font-bold text-white">What the recovery data is telling the agent</h3><p className="mt-1 text-sm text-slate-400">Deterministic explainability summaries derived from current playbook, case, and ledger results.</p></div></div><div className="grid gap-3 md:grid-cols-2">{cards.map(card => <details key={card.title} className={`group rounded-xl border ${surfaces[card.color]}`}><summary className="flex cursor-pointer list-none items-center gap-3 p-4"><card.icon className={`h-5 w-5 shrink-0 ${accents[card.color]}`} /><span className="min-w-0 flex-1"><span className={`block text-[10px] font-bold uppercase tracking-wider ${accents[card.color]}`}>{card.label}</span><span className="mt-1 block text-sm font-semibold text-white">{card.title}</span></span><ChevronDown className="h-4 w-4 text-slate-500 transition-transform group-open:rotate-180" /></summary><div className="border-t border-white/10 px-4 pb-4 pt-3"><p className="text-sm font-semibold text-slate-200">{card.summary}</p><p className="mt-2 text-xs leading-relaxed text-slate-400">{card.body}</p></div></details>)}</div></section>;
}

function ShieldIcon(props: { className?: string }) { return <AlertTriangle {...props} />; }

function money(value: number) { return `₹${Number(value || 0).toLocaleString('en-IN')}`; }

// Custom tooltip
const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-[#252D3A] bg-[#10151F] p-3 shadow-xl text-xs">
      <p className="font-bold text-[#F5F7FA] mb-2">{label}</p>
      {payload.map((p: any, i: number) => (
        <p key={i} style={{ color: p.color }} className="flex items-center gap-2">
          <span className="inline-block h-2 w-2 rounded-full" style={{ background: p.color }} />
          {p.name}: {typeof p.value === 'number' && p.name?.includes('₹')
            ? `₹${p.value.toLocaleString('en-IN')}`
            : typeof p.value === 'number' && p.name?.includes('%')
              ? `${p.value}%`
              : typeof p.value === 'number' && p.value > 1000
                ? `₹${p.value.toLocaleString('en-IN')}`
                : p.value
          }
        </p>
      ))}
    </div>
  );
};

export const RecoveryCharts: React.FC<RecoveryChartsProps> = ({ metrics, loading = false }) => {

  // ── Loading state ──────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="animate-pulse h-24 rounded-xl bg-[#10151F] border border-[#252D3A]" />
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <SkeletonChart height={280} />
          <SkeletonChart height={280} />
        </div>
        <SkeletonChart height={200} />
      </div>
    );
  }

  // ── No data state ──────────────────────────────────────────────────────
  if (!metrics) {
    return (
      <div className="rounded-xl border border-[#252D3A] bg-[#141A24] p-12 flex flex-col items-center gap-4 text-center">
        <div className="p-4 rounded-full bg-[#10151F] border border-[#252D3A]">
          <BarChart3 className="h-8 w-8 text-[#4B5563]" />
        </div>
        <p className="text-sm font-semibold text-[#F5F7FA]">No analytics data yet</p>
        <p className="text-xs text-[#98A2B3] max-w-xs">
          Run the Batch Simulator to generate recovery cases and populate analytics.
        </p>
      </div>
    );
  }

  // ── Derived data ──────────────────────────────────────────────────────
  const playbookList: any[] = metrics.playbookMetrics || [];
  const total    = Number(metrics.totalCasesCount      ?? 0);
  const atRisk   = Number(metrics.totalRevenueAtRisk    ?? 0);
  const recovered= Number(metrics.totalRevenueRecovered ?? 0);
  const rate     = Number(metrics.overallRecoveryRate   ?? 0);
  const escalated= Number(metrics.escalatedCasesCount   ?? 0);
  const ledger   = Number(metrics.ledgerEntriesCount    ?? 0);

  // Per-playbook bar chart data
  const playbookData = playbookList.map((p: any, idx: number) => ({
    name: (p.playbook || '').replace(/_/g, ' ').split(' ').slice(0, 2).join(' '),
    fullName: p.displayName || p.playbook,
    atRisk:    Number(p.atRisk    || 0),
    recovered: Number(p.recovered || 0),
    rate:      Number(p.recoveryRate || 0),
    count:     Number(p.caseCount || 0),
    color:     PLAYBOOK_COLORS[p.playbook] || FALLBACK_COLORS[idx % FALLBACK_COLORS.length],
  }));

  // Pie chart for case status distribution
  const resolved  = Number(metrics.resolvedCasesCount  ?? 0);
  const active    = Number(metrics.activeWorkflowsCount ?? 0);
  const pieData = [
    { name: 'Recovered',  value: resolved,  color: '#10B981' },
    { name: 'Escalated',  value: escalated, color: '#F59E0B' },
    { name: 'Active',     value: active,    color: '#3B82F6' },
    { name: 'Stopped',    value: Math.max(0, total - resolved - escalated - active), color: '#EF4444' },
  ].filter(d => d.value > 0);

  // Recovery rate chart from recent recoveries for trend
  const recentRecoveries: any[] = metrics.recentRecoveries || [];
  const trendData = recentRecoveries.slice(0, 8).reverse().map((r: any, i: number) => ({
    label: `Rec ${i + 1}`,
    amount: Number(r.recovered_amount || 0),
  }));

  const hasPlaybookData  = playbookData.some(p => p.atRisk > 0 || p.recovered > 0);
  const hasPieData       = pieData.length > 0;

  return (
    <div className="space-y-6">

      {/* ── Summary KPIs ──────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <SummaryCard
          label="Revenue at Risk"
          value={`₹${atRisk.toLocaleString('en-IN')}`}
          sub="Across all active cases"
          valueColor="text-amber-400"
          Icon={AlertTriangle}
          iconCls="text-amber-400"
        />
        <SummaryCard
          label="Verified Recovered"
          value={`₹${recovered.toLocaleString('en-IN')}`}
          sub={`${ledger} ledger entries`}
          valueColor="text-emerald-400"
          Icon={CheckCircle2}
          iconCls="text-emerald-400"
        />
        <SummaryCard
          label="Recovery Win Rate"
          value={`${rate.toFixed(1)}%`}
          sub="Webhook-verified only"
          valueColor="text-blue-400"
          Icon={TrendingUp}
          iconCls="text-blue-400"
        />
        <SummaryCard
          label="Total Cases"
          value={total.toLocaleString()}
          sub={`${escalated} escalated`}
          valueColor="text-cyan-400"
          Icon={Activity}
          iconCls="text-cyan-400"
        />
      </div>

      <AIAnalysisSection playbookData={playbookData} atRisk={atRisk} recovered={recovered} rate={rate} escalated={escalated} active={active} total={total} ledger={ledger} />

      {/* ── Playbook Revenue Charts ────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Chart 1: At-Risk vs Recovered per playbook */}
        <div className="rounded-xl border border-[#252D3A] bg-[#141A24] p-5 shadow-lg">
          <div className="mb-4">
            <h3 className="text-sm font-bold text-[#F5F7FA]">Revenue At-Risk vs Recovered (₹)</h3>
            <p className="text-xs text-[#98A2B3] mt-0.5">Performance across 7 autonomous recovery playbooks</p>
          </div>

          {!hasPlaybookData ? (
            <div className="h-64 flex items-center justify-center text-xs text-[#98A2B3]">
              Run a simulation to populate playbook data
            </div>
          ) : (
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={playbookData} margin={{ top: 5, right: 10, left: 0, bottom: 30 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#252D3A" opacity={0.5} />
                  <XAxis
                    dataKey="name"
                    tick={{ fill: '#98A2B3', fontSize: 9 }}
                    interval={0}
                    angle={-30}
                    textAnchor="end"
                    height={50}
                  />
                  <YAxis
                    tick={{ fill: '#98A2B3', fontSize: 9 }}
                    tickFormatter={(v) => `₹${v >= 100000 ? `${(v/100000).toFixed(1)}L` : v >= 1000 ? `${(v/1000).toFixed(0)}k` : v}`}
                    width={55}
                  />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend
                    wrapperStyle={{ fontSize: '11px', color: '#98A2B3', paddingTop: '8px' }}
                    formatter={(value) => <span style={{ color: '#98A2B3' }}>{value}</span>}
                  />
                  <Bar dataKey="atRisk"    name="At Risk ₹"    fill="#F59E0B" radius={[3,3,0,0]} maxBarSize={40} />
                  <Bar dataKey="recovered" name="Recovered ₹"  fill="#10B981" radius={[3,3,0,0]} maxBarSize={40} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* Chart 2: Playbook Win Rate */}
        <div className="rounded-xl border border-[#252D3A] bg-[#141A24] p-5 shadow-lg">
          <div className="mb-4">
            <h3 className="text-sm font-bold text-[#F5F7FA]">Recovery Win Rate by Playbook</h3>
            <p className="text-xs text-[#98A2B3] mt-0.5">Percentage of at-risk revenue settled to ledger</p>
          </div>

          {!hasPlaybookData ? (
            <div className="h-64 flex items-center justify-center text-xs text-[#98A2B3]">
              Run a simulation to populate playbook data
            </div>
          ) : (
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={playbookData} layout="vertical" margin={{ top: 5, right: 25, left: 10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#252D3A" opacity={0.5} />
                  <XAxis type="number" domain={[0,100]} unit="%" tick={{ fill: '#98A2B3', fontSize: 9 }} />
                  <YAxis dataKey="name" type="category" tick={{ fill: '#98A2B3', fontSize: 9 }} width={70} />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="rate" name="Win Rate %" radius={[0,3,3,0]} maxBarSize={22}>
                    {playbookData.map((entry, idx) => (
                      <Cell key={`cell-${idx}`} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>

      {/* ── Case Distribution + Trend ──────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Pie: Case status breakdown */}
        <div className="rounded-xl border border-[#252D3A] bg-[#141A24] p-5 shadow-lg">
          <div className="mb-4">
            <h3 className="text-sm font-bold text-[#F5F7FA]">Case Status Distribution</h3>
            <p className="text-xs text-[#98A2B3] mt-0.5">Breakdown of all cases by pipeline outcome</p>
          </div>

          {!hasPieData ? (
            <div className="h-52 flex items-center justify-center text-xs text-[#98A2B3]">No cases yet</div>
          ) : (
            <div className="flex items-center gap-6">
              <div className="h-52 flex-1">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={pieData}
                      cx="50%"
                      cy="50%"
                      innerRadius={55}
                      outerRadius={85}
                      paddingAngle={3}
                      dataKey="value"
                    >
                      {pieData.map((entry, idx) => (
                        <Cell key={`pie-${idx}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{ backgroundColor: '#10151F', borderColor: '#252D3A', borderRadius: '8px', color: '#F5F7FA', fontSize: '12px' }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="space-y-2 shrink-0">
                {pieData.map((d) => (
                  <div key={d.name} className="flex items-center gap-2 text-xs">
                    <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: d.color }} />
                    <span className="text-[#98A2B3]">{d.name}</span>
                    <span className="font-bold text-[#F5F7FA] ml-auto pl-3">{d.value}</span>
                  </div>
                ))}
                <div className="pt-2 border-t border-[#252D3A]">
                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-[#98A2B3]">Total</span>
                    <span className="font-bold text-[#F5F7FA] ml-auto">{total}</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Line: Recent recovery trend */}
        <div className="rounded-xl border border-[#252D3A] bg-[#141A24] p-5 shadow-lg">
          <div className="mb-4">
            <h3 className="text-sm font-bold text-[#F5F7FA]">Recent Recovery Amounts</h3>
            <p className="text-xs text-[#98A2B3] mt-0.5">Latest verified ledger settlements (₹)</p>
          </div>

          {trendData.length === 0 ? (
            <div className="h-52 flex items-center justify-center text-xs text-[#98A2B3]">
              No recovered cases yet — run Execute Recovery
            </div>
          ) : (
            <div className="h-52 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trendData} margin={{ top: 5, right: 15, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#252D3A" opacity={0.4} />
                  <XAxis dataKey="label" tick={{ fill: '#98A2B3', fontSize: 9 }} />
                  <YAxis
                    tick={{ fill: '#98A2B3', fontSize: 9 }}
                    tickFormatter={(v) => `₹${v >= 1000 ? `${(v/1000).toFixed(0)}k` : v}`}
                    width={45}
                  />
                  <Tooltip content={<CustomTooltip />} />
                  <Line
                    type="monotone"
                    dataKey="amount"
                    name="Recovered ₹"
                    stroke="#10B981"
                    strokeWidth={2}
                    dot={{ fill: '#10B981', r: 3 }}
                    activeDot={{ r: 5, fill: '#34D399' }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>

      {/* ── Per-playbook breakdown table ───────────────────────────────── */}
      {hasPlaybookData && (
        <div className="rounded-xl border border-[#252D3A] bg-[#141A24] overflow-hidden">
          <div className="px-5 py-3 border-b border-[#252D3A] bg-[#10151F]">
            <h3 className="text-xs font-bold uppercase tracking-wider text-[#98A2B3]">
              Playbook Performance Breakdown
            </h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="border-b border-[#252D3A] bg-[#080B12]">
                <tr>
                  {['Playbook', 'Cases', 'At Risk', 'Recovered', 'Win Rate', 'Progress'].map(h => (
                    <th key={h} className="py-2.5 px-4 text-left font-semibold uppercase tracking-wider text-[#98A2B3] text-[10px]">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#252D3A]">
                {playbookData.map((p) => (
                  <tr key={p.fullName} className="hover:bg-[#10151F] transition-colors">
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        <span className="h-2 w-2 rounded-full shrink-0" style={{ background: p.color }} />
                        <span className="text-[#F5F7FA] font-medium">{p.fullName}</span>
                      </div>
                    </td>
                    <td className="py-3 px-4 font-mono text-[#98A2B3]">{p.count}</td>
                    <td className="py-3 px-4 font-mono text-amber-400">
                      ₹{p.atRisk.toLocaleString('en-IN')}
                    </td>
                    <td className="py-3 px-4 font-mono text-emerald-400">
                      ₹{p.recovered.toLocaleString('en-IN')}
                    </td>
                    <td className="py-3 px-4">
                      <span className={`font-bold ${p.rate >= 50 ? 'text-emerald-400' : p.rate >= 25 ? 'text-amber-400' : 'text-rose-400'}`}>
                        {p.rate.toFixed(1)}%
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-1.5 rounded-full bg-[#252D3A] overflow-hidden min-w-[60px]">
                          <div
                            className="h-full rounded-full transition-all"
                            style={{ width: `${Math.min(100, p.rate)}%`, background: p.color }}
                          />
                        </div>
                        <span className="text-[10px] font-mono text-[#98A2B3] w-8 text-right">{p.rate.toFixed(0)}%</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

    </div>
  );
};
