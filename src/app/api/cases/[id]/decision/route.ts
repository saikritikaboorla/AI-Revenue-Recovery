import { NextResponse, NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { getAIDecision } from '@/lib/ai-claude';

export const dynamic = 'force-dynamic';

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const recCase = db.getCaseById(id);
  if (!recCase) return NextResponse.json({ error: 'Case not found' }, { status: 404 });
  const decision = recCase.ai_decision || await getAIDecision(recCase, db.getGuardrails(), db.getCustomerById(recCase.customer_id));
  if (!recCase.ai_decision) {
    recCase.ai_decision = decision;
    db.saveCase(recCase);
    db.addAudit({
      id: `aud_${id}_ai_${Date.now()}`,
      case_id: id,
      timestamp: decision.timestamp,
      stage: 'DECIDE_PLAYBOOK',
      actor: decision.source === 'CLAUDE_AI' ? 'CLAUDE_AI_DIAGNOSIS_ENGINE' : 'RECOVERAI_DECISION_ENGINE',
      action: decision.aiFallbackUsed ? 'DECISION_FALLBACK' : 'AUTOMATED_DECISION_REQUESTED',
      result: decision.escalationRequired ? 'ESCALATED' : 'SUCCESS',
      details: decision.aiFallbackUsed
        ? `Deterministic fallback used (${decision.aiFallbackReason}). ${decision.detectedIssue}.`
        : `[AI: ${decision.aiProvider ?? 'Claude'} / ${decision.aiModel}] ${decision.detectedIssue}. ${decision.expectedOutcome}`,
      metadata: { aiDecision: decision },
    });
  }
  return NextResponse.json({ decision, source: decision.source });
}
