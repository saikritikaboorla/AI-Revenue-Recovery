import { NextResponse, NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { PLAYBOOK_CONFIGS } from '@/lib/playbooks';
import { createAIDecision } from '@/lib/ai-decision';
import { evaluateGuardrails } from '@/lib/guardrails';

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

  const guardrails = db.getGuardrails();
  const config = PLAYBOOK_CONFIGS[recCase.playbook];
  const ledgerEntries = db.getLedgerEntriesByCaseId(id);
  const promise = db.getPromiseByCaseId(id);
  const aiDecision = recCase.ai_decision || createAIDecision(recCase, guardrails, db.getCustomerById(recCase.customer_id));
  if (!recCase.ai_decision) {
    recCase.ai_decision = aiDecision;
    db.saveCase(recCase);
    db.addAudit({
      id: `aud_${id}_ai_${Date.now()}`,
      case_id: id,
      timestamp: aiDecision.timestamp,
      stage: 'DECIDE_PLAYBOOK',
      actor: 'RECOVER_AI_DECISION_SERVICE',
      action: 'AI_DECISION_REQUESTED',
      result: aiDecision.escalationRequired ? 'ESCALATED' : 'SUCCESS',
      details: `${aiDecision.detectedIssue}. ${aiDecision.expectedOutcome}`,
      metadata: { aiDecision },
    });
  }
  const audits = db.getAuditsByCaseId(id);

  // Real guardrail check evaluation
  const maxRetries = config?.maxRetries || guardrails.maxRetries;
  const guardrailChecks = evaluateGuardrails(recCase, guardrails, maxRetries);
  const retryLimitPassed = guardrailChecks.maxRetriesUnderLimit;

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
      description: `Attempt ${recCase.retry_count} of ${maxRetries} maximum allowed retries.`
    }
  ];

  // Candidate scores are derived from the case's persisted risk, failure signature,
  // retry headroom, and selected confidence. They are explainability summaries,
  // not hidden model reasoning.
  return NextResponse.json({
    case: recCase,
    audits,
    guardrailChecks,
    factors,
    playbookConfig: config,
    aiDecision,
    candidatePlaybooks: aiDecision.candidateActions.map(candidate => ({ ...candidate, score: candidate.estimatedProbability, label: candidate.action.replace(/_/g, ' ') })),
    customerHistory: {
      segment: recCase.customer_segment,
      riskScore: recCase.customer_risk_score,
      retryCount: recCase.retry_count,
      maxRetries,
      pastRecoverySignal: `Historical segment and risk signals used; current case confidence ${recCase.recovery_confidence}%.`,
    },
    ledgerEntries,
    promise,
    proof: {
      amountAtRisk: recCase.amount,
      predictedRecoverable: Math.round(recCase.amount * aiDecision.recoveryProbability),
      verifiedRecovered: ledgerEntries.reduce((sum, entry) => sum + entry.recovered_amount, 0),
      verificationSource: ledgerEntries[0]?.verification_source || 'No settlement verified yet',
    }
  });
}
