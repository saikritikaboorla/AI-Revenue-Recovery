import { NextResponse, NextRequest } from 'next/server';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const promises = db.getPromises();
    return NextResponse.json({ promises, total: promises.length });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || 'Failed to fetch promises' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { caseId, action } = body as { caseId?: string; action?: string };

    if (!caseId || !action) {
      return NextResponse.json(
        { error: 'caseId and action are required' },
        { status: 400 }
      );
    }

    const recCase = db.getCaseById(caseId);
    if (!recCase) {
      return NextResponse.json(
        { error: `Case ${caseId} not found` },
        { status: 404 }
      );
    }

    // Handle promise follow-up actions
    switch (action) {
      case 'MARK_KEPT': {
        // Record that the promise was kept — update case status to recovered if pending
        if (recCase.status !== 'RECOVERED') {
          recCase.status = 'RECOVERED';
          recCase.recovered_amount = recCase.recovered_amount || recCase.amount;
          recCase.recovered_at = new Date().toISOString();
          db.saveCase(recCase);
        }
        return NextResponse.json({
          success: true,
          message: `Promise for case ${caseId} marked as KEPT`,
          caseId,
          action,
          updatedStatus: recCase.status,
        });
      }

      case 'MARK_BROKEN': {
        // Promise was broken — escalate for manual follow-up
        if (recCase.status !== 'ESCALATED') {
          recCase.status = 'ESCALATED';
          recCase.escalation_reason = 'Promise-to-pay commitment broken. Manual follow-up required.';
          recCase.escalated_to = 'Collections Team';
          db.saveCase(recCase);
          db.addEscalation({
            id: `esc_ptp_${Date.now().toString().slice(-6)}`,
            case_id: caseId,
            customer_name: recCase.customer_name,
            amount: recCase.amount,
            playbook: recCase.playbook,
            reason: recCase.escalation_reason,
            risk_score: recCase.customer_risk_score,
            status: 'PENDING',
            assigned_to: 'Collections Team',
            created_at: new Date().toISOString(),
          });
        }
        return NextResponse.json({
          success: true,
          message: `Promise for case ${caseId} marked as BROKEN and escalated`,
          caseId,
          action,
          updatedStatus: recCase.status,
        });
      }

      case 'SEND_REMINDER': {
        // Log a reminder audit event
        db.addAudit({
          id: `aud_ptp_remind_${Date.now()}`,
          case_id: caseId,
          timestamp: new Date().toISOString(),
          stage: 'EXECUTE_ACTION',
          actor: 'RECOVER_AI_ENGINE',
          action: 'PROMISE_REMINDER_SENT',
          result: 'SUCCESS',
          details: `Promise-to-pay reminder dispatched to ${recCase.customer_email} for ₹${recCase.amount.toLocaleString('en-IN')}.`,
        });
        return NextResponse.json({
          success: true,
          message: `Reminder sent for case ${caseId}`,
          caseId,
          action,
        });
      }

      case 'RESCHEDULE': {
        // Reschedule a broken or overdue promise — reset to action-in-progress
        recCase.status = 'ACTION_IN_PROGRESS';
        recCase.current_step = 'PROMISE_RESCHEDULED';
        recCase.retry_count = Math.max(0, recCase.retry_count - 1);
        db.saveCase(recCase);
        db.addAudit({
          id: `aud_ptp_reschedule_${Date.now()}`,
          case_id: caseId,
          timestamp: new Date().toISOString(),
          stage: 'EXECUTE_ACTION',
          actor: 'RECOVER_AI_ENGINE',
          action: 'PROMISE_RESCHEDULED',
          result: 'SUCCESS',
          details: `Promise-to-pay rescheduled for case ${caseId}. New follow-up window opened.`,
        });
        return NextResponse.json({
          success: true,
          message: `Promise for case ${caseId} rescheduled`,
          caseId,
          action,
          updatedStatus: recCase.status,
        });
      }

      default:
        return NextResponse.json(
          { error: `Unknown action: ${action}. Valid actions: MARK_KEPT, MARK_BROKEN, SEND_REMINDER, RESCHEDULE` },
          { status: 400 }
        );
    }
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || 'Failed to process promise action' },
      { status: 500 }
    );
  }
}
