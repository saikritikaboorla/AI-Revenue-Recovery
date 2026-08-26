import { NextResponse, NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { RecoveryPipeline } from '@/lib/playbooks/engine';

export const dynamic = 'force-dynamic';

export async function GET() {
  const escalations = db.getEscalations();
  return NextResponse.json({ escalations, total: escalations.length });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { caseId, action } = body; // action: 'APPROVE' | 'REJECT'
    if (!caseId || !action) {
      return NextResponse.json({ error: 'caseId and action (APPROVE|REJECT) required' }, { status: 400 });
    }

    const recCase = db.getCaseById(caseId);
    if (!recCase) {
      return NextResponse.json({ error: `Case ${caseId} not found` }, { status: 404 });
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
        result: 'SUCCESS',
        details: `Senior Operations Specialist approved autonomous execution for case ${caseId}. Guardrails overridden with human authority.`
      });

      // Execute pipeline with force approval
      const pipelineResult = await RecoveryPipeline.processCase(caseId, { forceApproval: true });
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

      return NextResponse.json({
        success: true,
        caseId,
        action: 'REJECTED',
        case: recCase
      });
    }
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Failed to update escalation' }, { status: 400 });
  }
}
