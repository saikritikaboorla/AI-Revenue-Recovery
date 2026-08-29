import { NextResponse, NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { getAIDecision } from '@/lib/ai-gemini';

export const dynamic = 'force-dynamic';

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await db.ensureDurableState();
  const { id } = await params;
  const recCase = db.getCaseById(id);
  if (!recCase) return NextResponse.json({ error: 'Case not found' }, { status: 404 });
  const decision = recCase.ai_decision || await getAIDecision(recCase, db.getGuardrails(), db.getCustomerById(recCase.customer_id));
  if (!recCase.ai_decision) {
    recCase.ai_decision = decision;
    db.saveCase(recCase);
    // A read may cache the decision for the next workflow request, but it must
    // not append a late DECIDE event after execution has already completed.
    await db.flushDurableState();
  }
  return NextResponse.json({
    decision,
    source: decision.source,
    decisionSource: decision.source === 'GEMINI_AI' && !decision.aiFallbackUsed ? 'Gemini' : 'Deterministic fallback',
  });
}
