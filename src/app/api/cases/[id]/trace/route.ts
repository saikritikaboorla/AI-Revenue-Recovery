import { NextResponse, NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { PLAYBOOK_CONFIGS } from '@/lib/playbooks';
import { getAIDecision } from '@/lib/ai-gemini';
import { evaluateGuardrails } from '@/lib/guardrails';
import { formatRetryStatus } from '@/lib/guardrails';
import { buildHinglishTranscript } from '@/lib/hinglish-engine';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  await db.ensureDurableState();
  const { id } = await params;
  const recCase = db.getCaseById(id);
  if (!recCase) {
    return NextResponse.json({ error: 'Case not found' }, { status: 404 });
  }

  const guardrails = db.getGuardrails();
  const seededConfig = PLAYBOOK_CONFIGS[recCase.playbook];
  const ledgerEntries = db.getLedgerEntriesByCaseId(id);
  const promise = db.getPromiseByCaseId(id);
  const hinglishTranscript = recCase.playbook === 'HINGLISH_RECOVERY' ? buildHinglishTranscript(recCase) : null;
  if (hinglishTranscript) {
    hinglishTranscript.ledgerEntryId = ledgerEntries[0]?.id;
    hinglishTranscript.recoveredAmount = ledgerEntries[0]?.recovered_amount || 0;
    hinglishTranscript.settlementVerified = ledgerEntries.length > 0;
  }
  const aiDecision = recCase.ai_decision || await getAIDecision(recCase, guardrails, db.getCustomerById(recCase.customer_id));
  if (!recCase.ai_decision) {
    recCase.ai_decision = aiDecision;
    db.saveCase(recCase);
    db.addAudit({
      id: `aud_${id}_ai_${Date.now()}`,
      case_id: id,
      timestamp: aiDecision.timestamp,
      stage: 'DECIDE_PLAYBOOK',
      actor: aiDecision.source === 'GEMINI_AI' ? 'GEMINI_DIAGNOSIS_ENGINE' : 'RECOVERAI_DECISION_ENGINE',
      action: aiDecision.aiFallbackUsed ? 'DECISION_FALLBACK' : 'AUTOMATED_DECISION_REQUESTED',
      result: aiDecision.escalationRequired ? 'ESCALATED' : 'DECIDED',
      details: aiDecision.aiFallbackUsed
        ? `Deterministic fallback used (${aiDecision.aiFallbackReason}). ${aiDecision.detectedIssue}. ${aiDecision.expectedOutcome}`
        : `[AI: ${aiDecision.aiProvider ?? 'Gemini'} / ${aiDecision.aiModel}] ${aiDecision.detectedIssue}. ${aiDecision.expectedOutcome}`,
      metadata: { aiDecision },
    });
    await db.flushDurableState();
  }
  const effectivePlaybook = aiDecision.selectedPlaybook !== 'HUMAN_ESCALATION' && aiDecision.selectedPlaybook in PLAYBOOK_CONFIGS
    ? aiDecision.selectedPlaybook
    : recCase.playbook;
  const config = PLAYBOOK_CONFIGS[effectivePlaybook] || seededConfig;
  const audits = db.getAuditsByCaseId(id);

  // Real guardrail check evaluation
  const maxRetries = Math.min(config?.maxRetries || guardrails.maxRetries, guardrails.maxRetries);
  const guardrailChecks = evaluateGuardrails(recCase, guardrails, maxRetries, db.getCustomerById(recCase.customer_id));
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
      description: `${formatRetryStatus(recCase.retry_count, maxRetries)} maximum allowed retries.`
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
    decisionSource: aiDecision.source === 'GEMINI_AI' && !aiDecision.aiFallbackUsed ? 'Gemini' : 'Deterministic fallback',
    candidatePlaybooks: aiDecision.candidateActions.map(candidate => ({ ...candidate, score: candidate.estimatedProbability, label: candidate.action.replace(/_/g, ' ') })),
    customerHistory: {
      segment: recCase.customer_segment,
      riskScore: recCase.customer_risk_score,
      retryCount: guardrailChecks.retryCount,
      maxRetries,
      pastRecoverySignal: `Historical segment and risk signals used; current case confidence ${recCase.recovery_confidence}%.`,
    },
    ledgerEntries,
    promise,
    hinglishTranscript,
    proof: {
      amountAtRisk: recCase.amount,
      predictedRecoverable: Math.round(recCase.amount * aiDecision.recoveryProbability),
      verifiedRecovered: ledgerEntries.reduce((sum, entry) => sum + entry.recovered_amount, 0),
      verificationSource: ledgerEntries[0]?.verification_source || 'No settlement verified yet',
    },
    finalOutcome: recCase.status === 'RECOVERED'
      ? 'RECOVERED'
      : recCase.status === 'ESCALATED'
        ? 'ESCALATED'
        : String(recCase.status).startsWith('STOPPED')
          ? 'STOPPED'
          : 'NOT_RECOVERED',
    stageStory: [
      {
        stage: 'DETECTED',
        details: `Issue ${recCase.failure_reason} detected with ₹${recCase.amount.toLocaleString('en-IN')} at risk for ${recCase.customer_name}.`,
      },
      {
        stage: 'DIAGNOSED',
        details: recCase.diagnosis_summary || aiDecision.diagnosis,
      },
      {
        stage: 'PLAYBOOK_SELECTED',
        details: `${effectivePlaybook} selected by ${aiDecision.source === 'GEMINI_AI' && !aiDecision.aiFallbackUsed ? 'Gemini' : 'deterministic fallback'}${recCase.rationale ? `: ${recCase.rationale}` : ''}.`,
      },
      {
        stage: 'GUARDRAILS',
        details: guardrailChecks.overallGuardrailPassed
          ? 'All applicable guardrails passed.'
          : `Policy blocked autonomous action: ${[!guardrailChecks.maxRetriesUnderLimit ? formatRetryStatus(recCase.retry_count, maxRetries) : '', !guardrailChecks.riskScoreApproved ? `risk ${recCase.customer_risk_score}` : '', !guardrailChecks.valueApproved ? 'exposure limit' : '', !guardrailChecks.playbookAllowed ? 'playbook not allowed' : '', !guardrailChecks.contactAllowed ? 'do-not-contact' : '', !guardrailChecks.automationAllowed ? 'review-first mode' : ''].filter(Boolean).join(', ')}.`,
      },
      {
        stage: 'ACTION',
        details: recCase.last_action
          ? `${recCase.last_action}${recCase.last_action_result ? ` — ${recCase.last_action_result}` : ''}`
          : 'No action recorded.',
      },
      {
        stage: 'VERIFY',
        details: ledgerEntries.length > 0
          ? `Settlement verified via ${ledgerEntries[0].verification_source} for ₹${ledgerEntries[0].recovered_amount.toLocaleString('en-IN')}.`
          : 'No settlement verification recorded yet.',
      },
      {
        stage: 'LEDGER',
        details: ledgerEntries.length > 0
          ? `Ledger entry ${ledgerEntries[0].id} written at ${ledgerEntries[0].verified_at}.`
          : 'No ledger entry recorded yet.',
      },
      ...(hinglishTranscript ? [{
        stage: 'SIMULATED_HINGLISH',
        details: `SIMULATED VOICE/WHATSAPP RECOVERY — PREVIEW. Branch ${hinglishTranscript.branch}, action ${hinglishTranscript.selectedAction}, outcome ${hinglishTranscript.outcome}${hinglishTranscript.settlementVerified ? `, verified amount ₹${hinglishTranscript.recoveredAmount.toLocaleString('en-IN')}` : ''}${hinglishTranscript.ledgerEntryId ? `, ledger ${hinglishTranscript.ledgerEntryId}` : ''}.`,
      }] : []),
    ],
  });
}
