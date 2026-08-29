import type { RecoveryCaseRecord, GuardrailPolicy, CustomerRecord } from './db';

export function evaluateGuardrails(recCase: RecoveryCaseRecord, guardrails: GuardrailPolicy, maxRetries: number, customer?: CustomerRecord) {
  const retryLimitPassed = recCase.retry_count < maxRetries;
  const riskThresholdPassed = recCase.customer_risk_score <= guardrails.maxRiskScoreForAutonomousAction;
  const valueCeilingPassed = recCase.amount <= guardrails.highValueThreshold;
  const playbookAllowed = guardrails.allowedPlaybooks.includes(recCase.playbook);
  const optedOut = Boolean(customer?.do_not_contact) || /DO_NOT_CONTACT|DND|OPT.?OUT/i.test(customer?.contact_preference || '');
  const contactAllowed = !guardrails.customerOptOutEnforced || !optedOut;
  const automationAllowed = guardrails.automationMode === 'AUTONOMOUS';

  return {
    maxRetriesUnderLimit: retryLimitPassed,
    retryCount: Math.min(Math.max(recCase.retry_count, 0), maxRetries),
    maxRetriesAllowed: maxRetries,
    customerRiskScore: recCase.customer_risk_score,
    maxRiskScoreAllowed: guardrails.maxRiskScoreForAutonomousAction,
    riskScoreApproved: riskThresholdPassed,
    amount: recCase.amount,
    highValueThreshold: guardrails.highValueThreshold,
    valueApproved: valueCeilingPassed,
    playbookAllowed,
    contactAllowed,
    automationAllowed,
    overallGuardrailPassed: retryLimitPassed && riskThresholdPassed && valueCeilingPassed && playbookAllowed && contactAllowed && automationAllowed,
  };
}

export function getGuardrailTrigger(checks: ReturnType<typeof evaluateGuardrails>): string | null {
  const triggers: string[] = [];
  if (!checks.maxRetriesUnderLimit) triggers.push(`MAX RETRIES REACHED (${checks.retryCount}/${checks.maxRetriesAllowed})`);
  if (!checks.riskScoreApproved) triggers.push(`Risk score (${checks.customerRiskScore}) exceeds ceiling (${checks.maxRiskScoreAllowed})`);
  if (!checks.valueApproved) triggers.push(`High financial exposure (₹${checks.amount.toLocaleString('en-IN')} exceeds ₹${checks.highValueThreshold.toLocaleString('en-IN')} threshold)`);
  if (!checks.playbookAllowed) triggers.push('PLAYBOOK BLOCKED BY MERCHANT POLICY');
  if (!checks.contactAllowed) triggers.push('CUSTOMER OPTED OUT / DO NOT CONTACT');
  if (!checks.automationAllowed) triggers.push('REVIEW-FIRST MODE REQUIRES HUMAN APPROVAL');
  return triggers.length ? triggers.join('; ') : null;
}

export function formatRetryStatus(retryCount: number, maxRetries: number): string {
  const displayedCount = Math.max(0, retryCount);
  return retryCount >= maxRetries
    ? `MAX RETRIES REACHED (${maxRetries}/${maxRetries})`
    : `${displayedCount}/${maxRetries}`;
}
