import { NextResponse, NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { createAIDecision } from '@/lib/ai-decision';

export const dynamic = 'force-dynamic';

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const recCase = db.getCaseById(id);
  if (!recCase) return NextResponse.json({ error: 'Case not found' }, { status: 404 });
  const decision = recCase.ai_decision || createAIDecision(recCase, db.getGuardrails(), db.getCustomerById(recCase.customer_id));
  if (!recCase.ai_decision) {
    recCase.ai_decision = decision;
    db.saveCase(recCase);
    db.addAudit({
      id: `aud_${id}_ai_${Date.now()}`,
      case_id: id,
      timestamp: decision.timestamp,
      stage: 'DECIDE_PLAYBOOK',
      actor: 'RECOVERAI_DECISION_ENGINE',
      action: 'AUTOMATED_DECISION_REQUESTED',
      result: decision.escalationRequired ? 'ESCALATED' : 'SUCCESS',
      details: `${decision.detectedIssue}. ${decision.expectedOutcome}`,
      metadata: { aiDecision: decision },
    });
  }
  return NextResponse.json({ decision, source: decision.source });
}
