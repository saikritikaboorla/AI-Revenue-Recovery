"use client";

import React, { useState, useEffect } from 'react';
import {
  ShieldCheck,
  Save,
  Check,
  AlertTriangle,
  RefreshCw,
  Info,
  Hash,
  Timer,
  IndianRupee,
  Brain,
  PhoneCall,
  Users,
} from 'lucide-react';

interface GuardrailPolicy {
  maxRetries: number;
  cooldownHours: number;
  highValueThreshold: number;
  maxRiskScoreForAutonomousAction: number;
  dailyContactLimit: number;
  enableVoiceAiForEnterpriseOnly: boolean;
}

const DEFAULTS: GuardrailPolicy = {
  maxRetries: 3,
  cooldownHours: 0.25,
  highValueThreshold: 100000,
  maxRiskScoreForAutonomousAction: 65,
  dailyContactLimit: 2,
  enableVoiceAiForEnterpriseOnly: false,
};

interface RuleCardConfig {
  key: keyof GuardrailPolicy;
  label: string;
  description: string;
  type: 'number' | 'toggle';
  icon: React.ReactNode;
  unit?: string;
  min?: number;
  max?: number;
  step?: number;
}

const RULE_CARDS: RuleCardConfig[] = [
  {
    key: 'maxRetries',
    label: 'Max Auto-Retries per Case',
    description:
      'Maximum number of autonomous recovery attempts before escalating to human ops. Prevents cardholder fatigue and regulatory exposure from excessive retry loops.',
    type: 'number',
    icon: <Hash className="h-4 w-4" />,
    min: 1,
    max: 10,
    step: 1,
  },
  {
    key: 'cooldownHours',
    label: 'Cooldown Window Hours',
    description:
      'Minimum enforced wait period between consecutive recovery interventions on the same case. Prevents rapid re-contact and ensures compliance with RBI outreach guidelines.',
    type: 'number',
    icon: <Timer className="h-4 w-4" />,
    unit: 'hrs',
    min: 0.05,
    max: 24,
    step: 0.05,
  },
  {
    key: 'highValueThreshold',
    label: 'High-Value Threshold ₹',
    description:
      'Transaction amounts above this ceiling always require Senior Ops authorization before any autonomous action. Caps autonomous financial exposure and satisfies enterprise risk policy.',
    type: 'number',
    icon: <IndianRupee className="h-4 w-4" />,
    unit: '₹',
    min: 1000,
    max: 10000000,
    step: 1000,
  },
  {
    key: 'maxRiskScoreForAutonomousAction',
    label: 'Max Risk Score for Autonomous Action',
    description:
      'Customers whose AI-computed risk score exceeds this threshold are routed to human review rather than autonomous action. Reduces bad-debt risk on high-risk accounts.',
    type: 'number',
    icon: <Brain className="h-4 w-4" />,
    unit: '/ 100',
    min: 10,
    max: 100,
    step: 5,
  },
  {
    key: 'dailyContactLimit',
    label: 'Daily Contact Limit per Customer',
    description:
      'Maximum number of outreach touches to a single customer within any 24-hour window across all channels (WhatsApp, SMS, Voice). Prevents spam classification and TRAI DND violations.',
    type: 'number',
    icon: <Users className="h-4 w-4" />,
    unit: 'contacts / day',
    min: 1,
    max: 10,
    step: 1,
  },
  {
    key: 'enableVoiceAiForEnterpriseOnly',
    label: 'Enable Voice AI for Enterprise Only',
    description:
      'When enabled, AI Voice IVR calls are restricted to ENTERPRISE and HIGH_LTV_VIP customer segments only. Reduces cost-per-intervention on lower-value segments while maximizing premium recovery.',
    type: 'toggle',
    icon: <PhoneCall className="h-4 w-4" />,
  },
];

// Informational guardrail logic cards
const INFO_CARDS = [
  {
    id: 'STOP_MAX_RETRIES',
    color: 'rose',
    title: 'STOP — Max Retries Reached',
    description:
      'When a case has exhausted its allowed retry budget, the autonomous engine halts all further interventions and creates an escalation record. A human officer must manually adjudicate or close the case.',
    dotColor: 'bg-rose-400',
    border: 'border-rose-500/20',
    bg: 'bg-rose-500/5',
    badgeCls: 'text-rose-300 bg-rose-500/10 border-rose-500/30',
  },
  {
    id: 'HIGH_VALUE_HUMAN_APPROVAL',
    color: 'amber',
    title: 'HOLD — High-Value Human Approval',
    description:
      'Transactions above the configured high-value threshold are automatically flagged as requiring_human_approval=true. The workflow pauses at the DECIDE_PLAYBOOK stage until a Senior Ops officer approves via the Escalations tab.',
    dotColor: 'bg-amber-400',
    border: 'border-amber-500/20',
    bg: 'bg-amber-500/5',
    badgeCls: 'text-amber-300 bg-amber-500/10 border-amber-500/30',
  },
  {
    id: 'COOLDOWN_ENFORCED',
    color: 'blue',
    title: 'COOLDOWN — Intervention Throttling',
    description:
      'Before dispatching any recovery channel (WhatsApp, SMS, Voice IVR, NACH batch), the guardrail monitor verifies that the cooldown window has fully elapsed since the last contact on this case. A BLOCKED audit event is logged if the cooldown is still active.',
    dotColor: 'bg-blue-400',
    border: 'border-blue-500/20',
    bg: 'bg-blue-500/5',
    badgeCls: 'text-blue-300 bg-blue-500/10 border-blue-500/30',
  },
];

function SkeletonCard() {
  return (
    <div className="rounded-lg bg-[#10151F] border border-[#252D3A] p-4 space-y-3 animate-pulse">
      <div className="flex items-center gap-2">
        <div className="h-8 w-8 rounded-lg bg-[#252D3A]" />
        <div className="h-4 w-36 rounded bg-[#252D3A]" />
      </div>
      <div className="h-3 w-full rounded bg-[#252D3A]" />
      <div className="h-3 w-4/5 rounded bg-[#252D3A]" />
      <div className="h-9 w-full rounded bg-[#252D3A]" />
    </div>
  );
}

export const GuardrailSettingsView: React.FC = () => {
  const [settings, setSettings] = useState<GuardrailPolicy | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch('/api/guardrails')
      .then((res) => res.json())
      .then((data: Partial<GuardrailPolicy>) => {
        // Merge with defaults so we never have undefined values
        setSettings({ ...DEFAULTS, ...data });
      })
      .catch((err) => {
        console.error('Failed to load guardrails:', err);
        setSettings({ ...DEFAULTS });
      })
      .finally(() => setLoading(false));
  }, []);

  const handleChange = <K extends keyof GuardrailPolicy>(
    key: K,
    value: GuardrailPolicy[K]
  ) => {
    if (!settings) return;
    setSettings({ ...settings, [key]: value });
    setSaved(false);
    setSaveError(null);
  };

  const handleSave = async () => {
    if (!settings) return;
    setSaving(true);
    setSaveError(null);
    try {
      const res = await fetch('/api/guardrails', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err: any) {
      console.error('Failed to save guardrails:', err);
      setSaveError(err.message || 'Failed to save. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-xl border border-[#252D3A] bg-[#141A24] p-6 shadow-xl space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 border-b border-[#252D3A] pb-5">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 rounded-lg bg-emerald-600/20 text-emerald-400 border border-emerald-500/30">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <h3 className="text-base font-bold text-[#F5F7FA]">
              Autonomous Guardrails &amp; Escalation Boundaries
            </h3>
          </div>
          <p className="text-xs text-[#98A2B3] mt-1.5 max-w-xl">
            Enforce statutory limits, cooldown windows, outreach caps, and maximum autonomous
            exposure ceilings. Changes take effect immediately on all future recovery decisions.
          </p>
        </div>

        <div className="flex flex-col items-end gap-2 shrink-0">
          <button
            onClick={handleSave}
            disabled={saving || loading || !settings}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-lg text-xs font-bold transition-all shadow-lg cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 ${
              saved
                ? 'bg-emerald-600 text-white shadow-[0_0_20px_rgba(34,197,94,0.4)]'
                : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-[0_0_15px_rgba(34,197,94,0.25)] hover:shadow-[0_0_25px_rgba(34,197,94,0.45)]'
            }`}
          >
            {saving ? (
              <RefreshCw className="h-4 w-4 animate-spin" />
            ) : saved ? (
              <Check className="h-4 w-4" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            {saving ? 'Updating…' : saved ? 'Guardrails Saved!' : 'Save Guardrails'}
          </button>
          {saveError && (
            <span className="flex items-center gap-1 text-[10px] text-rose-400">
              <AlertTriangle className="h-3 w-3" />
              {saveError}
            </span>
          )}
        </div>
      </div>

      {/* Guardrail Rule Cards — 2-col grid */}
      <div>
        <h4 className="text-xs font-semibold uppercase tracking-widest text-[#98A2B3] mb-4 flex items-center gap-2">
          <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
          Configurable Boundaries
        </h4>

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <SkeletonCard key={i} />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {RULE_CARDS.map((rule) => {
              const value = settings?.[rule.key] ?? DEFAULTS[rule.key];

              return (
                <div
                  key={rule.key}
                  className="rounded-xl bg-[#10151F] border border-[#252D3A] p-4 space-y-3 hover:border-[#374151] transition-colors"
                >
                  {/* Card Header */}
                  <div className="flex items-start gap-3">
                    <div className="p-1.5 rounded-lg bg-blue-600/10 text-blue-400 border border-blue-500/20 shrink-0 mt-0.5">
                      {rule.icon}
                    </div>
                    <div>
                      <span className="text-xs font-bold text-[#F5F7FA]">{rule.label}</span>
                      {rule.unit && (
                        <span className="ml-1.5 text-[10px] text-[#4B5563] font-mono">
                          {rule.unit}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Description */}
                  <p className="text-[11px] text-[#98A2B3] leading-relaxed">{rule.description}</p>

                  {/* Input or Toggle */}
                  {rule.type === 'number' ? (
                    <input
                      type="number"
                      value={value as number}
                      min={rule.min}
                      max={rule.max}
                      step={rule.step}
                      onChange={(e) =>
                        handleChange(rule.key, Number(e.target.value) as GuardrailPolicy[typeof rule.key])
                      }
                      className="w-full rounded-lg border border-[#252D3A] bg-[#080B12] px-3 py-2 text-xs font-mono text-[#F5F7FA] focus:border-blue-500 focus:ring-1 focus:ring-blue-500/20 focus:outline-none transition-colors"
                    />
                  ) : (
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-[#98A2B3]">
                        {(value as boolean) ? 'Enterprise Only — Enabled' : 'All Segments — Disabled'}
                      </span>
                      {/* Toggle Switch */}
                      <button
                        type="button"
                        role="switch"
                        aria-checked={value as boolean}
                        onClick={() => handleChange(rule.key, !(value as boolean) as GuardrailPolicy[typeof rule.key])}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 focus:ring-offset-[#080B12] cursor-pointer ${
                          (value as boolean) ? 'bg-emerald-500' : 'bg-[#374151]'
                        }`}
                      >
                        <span
                          className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-md transition-transform ${
                            (value as boolean) ? 'translate-x-6' : 'translate-x-1'
                          }`}
                        />
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Informational Guardrail Logic Cards */}
      <div>
        <h4 className="text-xs font-semibold uppercase tracking-widest text-[#98A2B3] mb-4 flex items-center gap-2">
          <Info className="h-3.5 w-3.5 text-blue-400" />
          Built-in Guardrail Logic
          <span className="text-[10px] text-[#4B5563] normal-case tracking-normal font-normal">
            — read-only system constraints
          </span>
        </h4>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {INFO_CARDS.map((card) => (
            <div
              key={card.id}
              className={`rounded-xl border p-4 space-y-3 ${card.bg} ${card.border}`}
            >
              {/* Badge + dot */}
              <div className="flex items-center gap-2">
                <span className={`h-2.5 w-2.5 rounded-full ${card.dotColor} shadow-lg`} />
                <span
                  className={`inline-flex items-center px-2 py-0.5 rounded border text-[10px] font-bold font-mono ${card.badgeCls}`}
                >
                  {card.id}
                </span>
              </div>

              {/* Title */}
              <p className="text-xs font-bold text-[#F5F7FA]">{card.title}</p>

              {/* Description */}
              <p className="text-[11px] text-[#98A2B3] leading-relaxed">{card.description}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Footer note */}
      <div className="flex items-start gap-2 rounded-lg border border-[#252D3A] bg-[#10151F] px-4 py-3">
        <Info className="h-4 w-4 text-blue-400 shrink-0 mt-0.5" />
        <p className="text-[11px] text-[#98A2B3] leading-relaxed">
          Guardrail settings are applied globally to all new recovery decisions. Existing in-progress
          workflows already past the CHECK_GUARDRAILS stage will not be affected until their next
          decision cycle. Settings persist in-memory for this session and reset on server restart
          unless a persistent backend store is configured.
        </p>
      </div>
    </div>
  );
};
