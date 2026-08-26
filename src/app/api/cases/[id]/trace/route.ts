import { NextResponse, NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { PLAYBOOK_CONFIGS } from '@/lib/playbooks';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const recCase = db.getCaseById(id);
  if (!recCase) {
    return NextResponse.json({ error: 'Case not found' }, { status: 404 });
  }

  const audits = db.getAuditsByCaseId(id);
  const guardrails = db.getGuardrails();
  const config = PLAYBOOK_CONFIGS[recCase.playbook];

  // Real guardrail check evaluation
  const retryLimitPassed = recCase.retry_count < (config?.maxRetries || guardrails.maxRetries);
  const riskThresholdPassed = recCase.customer_risk_score <= guardrails.maxRiskScoreForAutonomousAction;
  const valueCeilingPassed = recCase.amount <= guardrails.highValueThreshold;

  const guardrailChecks = {
    maxRetriesUnderLimit: retryLimitPassed,
    retryCount: recCase.retry_count,
    maxRetriesAllowed: config?.maxRetries || guardrails.maxRetries,
    customerRiskScore: recCase.customer_risk_score,
    maxRiskScoreAllowed: guardrails.maxRiskScoreForAutonomousAction,
    riskScoreApproved: riskThresholdPassed,
    amount: recCase.amount,
    highValueThreshold: guardrails.highValueThreshold,
    valueApproved: valueCeilingPassed,
    overallGuardrailPassed: retryLimitPassed && riskThresholdPassed && valueCeilingPassed,
  };

  // Structured Decision Factors derived from real record attributes
  const factors = [
    {
      factor: 'Customer Lifetime Value',
      impact: recCase.customer_segment === 'HIGH_LTV_VIP' || recCase.customer_segment === 'ENTERPRISE' ? 'POSITIVE' : 'NEUTRAL',
      weight: 0.35,
      description: `${recCase.customer_segment} account tier with high strategic value.`
    },
    {
      factor: 'Customer Risk Score',
      impact: recCase.customer_risk_score <= 40 ? 'POSITIVE' : recCase.customer_risk_score <= 65 ? 'NEUTRAL' : 'NEGATIVE',
      weight: 0.35,
      description: `Risk score evaluated at ${recCase.customer_risk_score}/100.`
    },
    {
      factor: 'Playbook Retry Headroom',
      impact: retryLimitPassed ? 'POSITIVE' : 'NEGATIVE',
      weight: 0.30,
      description: `Attempt ${recCase.retry_count} of ${config?.maxRetries || guardrails.maxRetries} maximum allowed retries.`
    }
  ];

  return NextResponse.json({
    case: recCase,
    audits,
    guardrailChecks,
    factors,
    playbookConfig: config
  });
}
