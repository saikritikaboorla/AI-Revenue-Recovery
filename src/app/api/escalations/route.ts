import { NextResponse, NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { RecoveryPipeline } from '@/lib/playbooks/engine';
import { PLAYBOOK_CONFIGS } from '@/lib/playbooks';
import { evaluateGuardrails, getGuardrailTrigger } from '@/lib/guardrails';
import { errorMessage, isRecord, requiredString } from '@/lib/api-validation';

export const dynamic = 'force-dynamic';

export async function GET() {
  await db.ensureDurableState();
  const escalations = db.getEscalations().map(escalation => {
    const recCase = db.getCaseById(escalation.case_id);
    if (!recCase) return escalation;
    const guardrails = db.getGuardrails();
    const maxRetries = Math.min(PLAYBOOK_CONFIGS[recCase.playbook]?.maxRetries || guardrails.maxRetries, guardrails.maxRetries);
    const trigger = getGuardrailTrigger(evaluateGuardrails(recCase, guardrails, maxRetries, db.getCustomerById(recCase.customer_id)));
    // Older seed rows contain a generic reason; current guardrail results are authoritative.
    return {
      ...escalation,
      // Recompute from the same guardrail evaluator used by the trace. Never
      // surface the stale generic CSV reason when a case has a specific reason.
      reason: trigger || recCase.escalation_reason || (escalation.status === 'PENDING'
        ? 'Human approval required by the case policy; inspect the case trace for the recorded decision.'
        : 'Historical escalation resolved; no current guardrail breach is active.'),
    };
  });
  return NextResponse.json({ escalations, total: escalations.length });
}

export async function POST(req: NextRequest) {
  await db.ensureDurableState();
  try {
    const body = await req.json();
    if (!isRecord(body)) throw new Error('A JSON object is required');
    const caseId = requiredString(body.caseId, 'caseId');
    const action = requiredString(body.action, 'action').toUpperCase();
    if (action !== 'APPROVE' && action !== 'REJECT') {
      return NextResponse.json({ error: 'caseId and action (APPROVE|REJECT) required' }, { status: 400 });
    }

    const recCase = db.getCaseById(caseId);
    if (!recCase) {
      return NextResponse.json({ error: `Case ${caseId} not found` }, { status: 404 });
    }

    const escalation = db.getEscalationByCaseId(caseId);
    if (!escalation) {
      return NextResponse.json({ error: `No escalation record exists for case ${caseId}` }, { status: 409 });
    }
    if (escalation.status !== 'PENDING') {
      return NextResponse.json({
        success: true,
        idempotent: true,
        caseId,
        action: escalation.status,
        escalation,
        case: recCase,
      });
    }

    if (action === 'APPROVE') {
      db.resolveEscalation(caseId, 'APPROVED');
      recCase.requires_human_approval = false;
      recCase.status = 'ACTION_IN_PROGRESS';
      recCase.current_step = 'HUMAN_APPROVED_EXECUTING';
      db.saveCase(recCase);

      db.addAudit({
        id: `aud_${caseId}_appr_${Date.now()}`,
        case_id: caseId,
        timestamp: new Date().toISOString(),
        stage: 'CHECK_GUARDRAILS',
        actor: 'HUMAN_OFFICER',
        action: 'ESCALATION_APPROVED',
        result: 'DECIDED',
        details: `Senior Operations Specialist approved autonomous execution for case ${caseId}. Guardrails overridden with human authority.`
      });
      // Execute pipeline with force approval
      const pipelineResult = await RecoveryPipeline.processCase(caseId, { forceApproval: true });
      await db.flushDurableState();
      return NextResponse.json({
        success: true,
        caseId,
        action: 'APPROVED',
        pipelineResult
      });
    } else {
      db.resolveEscalation(caseId, 'REJECTED');
      recCase.status = 'STOPPED_UNRECOVERABLE';
      recCase.current_step = 'STOPPED_HUMAN_REJECTED';
      recCase.requires_human_approval = false;
      recCase.escalation_reason = recCase.escalation_reason || 'Recovery action rejected by human approver; workflow stopped.';
      db.saveCase(recCase);

      db.addAudit({
        id: `aud_${caseId}_rej_${Date.now()}`,
        case_id: caseId,
        timestamp: new Date().toISOString(),
        stage: 'STOP_OR_ESCALATE',
        actor: 'HUMAN_OFFICER',
        action: 'ESCALATION_REJECTED',
        result: 'BLOCKED',
        details: `Senior Operations Specialist rejected recovery action for case ${caseId}. Workflow permanently stopped.`
      });
      await db.flushDurableState();

      return NextResponse.json({
        success: true,
        caseId,
        action: 'REJECTED',
        case: recCase
      });
    }
  } catch (err: any) {
    return NextResponse.json({ error: errorMessage(err, 'Failed to update escalation') }, { status: 400 });
  }
}
