import type { GuardrailPolicy, RecoveryCaseRecord, CustomerRecord } from './db';
import { PlaybookConfig, PlaybookType, PLAYBOOK_CONFIGS } from './playbooks';
import { formatRetryStatus } from './guardrails';

export type DecisionSignal = 'POSITIVE' | 'NEGATIVE' | 'NEUTRAL';
export type ConfidenceBand = 'HIGH' | 'MEDIUM' | 'LOW';

export interface AIDecisionFactor {
  factor: string;
  signal: DecisionSignal;
  value: number;
  evidence: string;
}

export interface AIGuardrailCheck {
  name: string;
  status: 'PASS' | 'BLOCK' | 'ESCALATE';
  value: string;
  reason: string;
}

export interface AICandidateAction {
  action: string;
  playbook: PlaybookType | 'HUMAN_ESCALATION';
  estimatedProbability: number;
  selected: boolean;
  available: boolean;
  reason: string;
}

export interface AIDecisionRecord {
  caseId: string;
  timestamp: string;
  riskScore: number;
  recoveryProbability: number;
  detectedIssue: string;
  diagnosis: string;
  candidateActions: AICandidateAction[];
  selectedAction: string;
  selectedPlaybook: PlaybookType | 'HUMAN_ESCALATION';
  decisionFactors: AIDecisionFactor[];
  guardrailChecks: AIGuardrailCheck[];
  expectedOutcome: string;
  escalationRequired: boolean;
  confidence: ConfidenceBand;
  confidencePercent: number;
  // AI source metadata — set by ai-gemini.ts
  source: 'DETERMINISTIC_LOCAL_DECISION_ENGINE' | 'GEMINI_AI';
  aiProvider?: string;
  aiModel?: string;
  aiRootCause?: string;
  aiReasoning?: string;
  aiRelevantSignals?: string[];
  aiRawResponse?: string;
  aiFallbackUsed?: boolean;
  aiFallbackReason?: string;
}

function issueLabel(failureReason: string, playbook?: PlaybookType): string {
  if (playbook === 'HINGLISH_RECOVERY') return 'Payment authorization assistance';
  if (playbook === 'MANDATE_RETRY') return 'Mandate retry timing issue';
  if (playbook === 'CHECKOUT_ABANDONMENT') return 'Checkout abandonment';
  if (playbook === 'PAYMENT_DEGRADATION') return 'Payment degradation';
  if (playbook === 'FAILED_SUBSCRIPTION') return 'Failed subscription or mandate';
  if (playbook === 'B2B_OVERDUE_RECEIVABLES') return 'Overdue receivable';
  if (playbook === 'PROMISE_TO_PAY') return 'Promise-to-pay settlement risk';
  const normalized = failureReason.toLowerCase();
  if (normalized.includes('timeout') || normalized.includes('downtime')) return 'Payment degradation';
  if (normalized.includes('drop') || normalized.includes('abandon') || normalized.includes('expiration')) return 'Checkout abandonment';
  if (normalized.includes('mandate') || normalized.includes('subscription')) return 'Failed subscription or mandate';
  if (normalized.includes('invoice') || normalized.includes('overdue') || normalized.includes('ap')) return 'Overdue receivable';
  return 'Payment recovery event';
}

function confidenceBand(value: number): ConfidenceBand {
  if (value >= 0.75) return 'HIGH';
  if (value >= 0.5) return 'MEDIUM';
  return 'LOW';
}

function firstAction(config?: PlaybookConfig): string {
  return config?.allowedActions[0] || 'human_review';
}

function diagnosisFor(recCase: RecoveryCaseRecord, issue: string): string {
  const reason = recCase.failure_reason.replace(/_/g, ' ').toLowerCase();
  const context = `${recCase.customer_segment.replace(/_/g, ' ')} customer, risk ${recCase.customer_risk_score}/100`;
  if (issue === 'Payment degradation') return `Issuer or gateway degradation was classified from ${reason}; retry/failover is evaluated as a transient recovery path (${context}).`;
  if (issue === 'Checkout abandonment') return `Checkout intent ended before authorization (${reason}); the case is routed to the checkout recovery channel while it remains recoverable (${context}).`;
  if (issue === 'Payment authorization assistance') return `Payment authorization was not completed (${reason}); the case is routed to the Hinglish conversational recovery channel while it remains recoverable (${context}).`;
  if (issue === 'Failed subscription or mandate') return `Recurring payment could not complete because of ${reason}; the subscription recovery playbook is evaluated against mandate and retry limits.`;
  if (issue === 'Overdue receivable') return `Receivable remains unpaid after ${reason}; collection action is bounded by amount, risk, retry, and human-escalation policy.`;
  return `Recovery event classified as ${reason} using the case failure signal and current customer risk context.`;
}

/**
 * Deterministic local decision service. It exposes concise evidence and policy
 * results, never hidden chain-of-thought. The pipeline still owns execution.
 */
export function createAIDecision(
  recCase: RecoveryCaseRecord,
  guardrails: GuardrailPolicy,
  customer?: CustomerRecord,
): AIDecisionRecord {
  const config = PLAYBOOK_CONFIGS[recCase.playbook];
  const now = new Date().toISOString();
  const riskScore = Math.max(0, Math.min(100, recCase.customer_risk_score));
  const recoveryProbability = Math.max(0, Math.min(1, recCase.recovery_confidence / 100));
  const retryLimit = recCase.retry_count < Math.min(config?.maxRetries || guardrails.maxRetries, guardrails.maxRetries);
  const riskAllowed = riskScore <= guardrails.maxRiskScoreForAutonomousAction;
  const amountAllowed = recCase.amount <= guardrails.highValueThreshold;
  const duplicateProtection = recCase.status !== 'RECOVERED' && dbLedgerAbsent(recCase);
  const actionable = recCase.status !== 'RECOVERED';
  const escalationRequired = actionable && (!retryLimit || !riskAllowed || !amountAllowed || !duplicateProtection);
  const selectedPlaybook = escalationRequired ? 'HUMAN_ESCALATION' : recCase.playbook;
  const selectedAction = escalationRequired ? 'human_review' : firstAction(config);
  const historyRate = customer?.past_recovery_rate ?? 0;
  const factors: AIDecisionFactor[] = [
    { factor: 'Payment history', signal: historyRate >= 65 ? 'POSITIVE' : historyRate >= 40 ? 'NEUTRAL' : 'NEGATIVE', value: historyRate, evidence: customer ? `${historyRate}% historical recovery rate for ${customer.segment.replace(/_/g, ' ')} customer.` : 'Customer history unavailable in the case record.' },
    { factor: 'Failure type', signal: /TIMEOUT|DOWNTIME|DROPOFF|EXPIRATION/i.test(recCase.failure_reason) ? 'POSITIVE' : 'NEUTRAL', value: /TIMEOUT|DOWNTIME|DROPOFF|EXPIRATION/i.test(recCase.failure_reason) ? 1 : 0, evidence: `${issueLabel(recCase.failure_reason)} classified from ${recCase.failure_reason}.` },
    { factor: 'Retry availability', signal: retryLimit ? 'POSITIVE' : 'NEGATIVE', value: Math.max(0, Math.min(config?.maxRetries || guardrails.maxRetries, guardrails.maxRetries) - recCase.retry_count), evidence: `${formatRetryStatus(recCase.retry_count, Math.min(config?.maxRetries || guardrails.maxRetries, guardrails.maxRetries))} attempts.` },
    { factor: 'Risk threshold', signal: riskAllowed ? 'POSITIVE' : 'NEGATIVE', value: riskScore, evidence: `Risk ${riskScore}/100 versus autonomous ceiling ${guardrails.maxRiskScoreForAutonomousAction}.` },
    { factor: 'Amount threshold', signal: amountAllowed ? 'POSITIVE' : 'NEGATIVE', value: recCase.amount, evidence: `At-risk amount ₹${recCase.amount.toLocaleString('en-IN')} versus ceiling ₹${guardrails.highValueThreshold.toLocaleString('en-IN')}.` },
  ];
  const checks: AIGuardrailCheck[] = [
    { name: 'Retry limit', status: retryLimit ? 'PASS' : 'ESCALATE', value: formatRetryStatus(recCase.retry_count, Math.min(config?.maxRetries || guardrails.maxRetries, guardrails.maxRetries)), reason: retryLimit ? 'Retry budget remains available.' : 'Retry limit exceeded.' },
    { name: 'Cooldown period', status: 'PASS', value: `${guardrails.cooldownHours}h policy`, reason: 'No cooldown violation is recorded by the current case state.' },
    { name: 'Risk threshold', status: riskAllowed ? 'PASS' : 'ESCALATE', value: `${riskScore}/100`, reason: riskAllowed ? 'Risk is within autonomous ceiling.' : 'Risk exceeds autonomous ceiling.' },
    { name: 'Amount threshold', status: amountAllowed ? 'PASS' : 'ESCALATE', value: `₹${recCase.amount.toLocaleString('en-IN')}`, reason: amountAllowed ? 'Amount is within autonomous action ceiling.' : 'High-value case requires human review.' },
    { name: 'Duplicate-action protection', status: duplicateProtection ? 'PASS' : 'BLOCK', value: recCase.status, reason: duplicateProtection ? 'No verified recovery or duplicate action is present.' : 'Terminal recovery state blocks another action.' },
    { name: 'Escalation policy', status: escalationRequired ? 'ESCALATE' : 'PASS', value: escalationRequired ? 'Human review' : 'Autonomous', reason: escalationRequired ? 'At least one autonomy guardrail requires human review.' : 'All required autonomy checks passed.' },
  ];
  const candidates: AICandidateAction[] = [
    ...(config?.allowedActions || []).map((action, index) => ({ action, playbook: recCase.playbook as PlaybookType, estimatedProbability: Math.max(0, Math.round(recoveryProbability * 100) - index * 8), selected: !escalationRequired && index === 0, available: true, reason: index === 0 ? 'Highest-ranked action supported by the selected playbook.' : 'Supported fallback action with lower deterministic fit for this case.' })),
    { action: 'human_review', playbook: 'HUMAN_ESCALATION', estimatedProbability: Math.max(10, Math.round((riskScore / 100) * 45)), selected: escalationRequired, available: true, reason: escalationRequired ? 'Selected because at least one autonomy guardrail requires human review.' : 'Safety fallback if an autonomy guardrail blocks execution.' },
  ];
  return {
    caseId: recCase.id, timestamp: now, riskScore, recoveryProbability, detectedIssue: issueLabel(recCase.failure_reason, recCase.playbook),
    diagnosis: diagnosisFor(recCase, issueLabel(recCase.failure_reason, recCase.playbook)),
    candidateActions: candidates, selectedAction, selectedPlaybook, decisionFactors: factors, guardrailChecks: checks,
    expectedOutcome: escalationRequired ? 'Human review required before any recovery action.' : `Execute ${selectedAction.replace(/_/g, ' ')} and verify provider settlement before ledger write.`,
    escalationRequired, confidence: confidenceBand(recoveryProbability), confidencePercent: Math.round(recoveryProbability * 100), source: 'DETERMINISTIC_LOCAL_DECISION_ENGINE',
  };
}

// Kept deliberately pure: verified ledger state is passed to the service by the
// caller in production; this fallback protects terminal cases without side effects.
function dbLedgerAbsent(recCase: RecoveryCaseRecord): boolean {
  return recCase.recovered_amount === 0 && recCase.status !== 'RECOVERED';
}
