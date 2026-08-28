import { NextResponse, NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { errorMessage, isRecord, optionalDate, optionalFiniteNumber, requiredString } from '@/lib/api-validation';

export const dynamic = 'force-dynamic';

export async function GET() {
  await db.ensureDurableState();
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
    await db.ensureDurableState();
    const body = await req.json().catch(() => null);
    if (!isRecord(body)) throw new Error('A JSON object is required');
    const { caseId, action, promiseDate, amount, channel } = body as {
      caseId?: string;
      action?: string;
      promiseDate?: string;
      amount?: number;
      channel?: string;
    };

    const safeCaseId = requiredString(caseId, 'caseId');
    const safeAction = requiredString(action, 'action').toUpperCase();
    const safeAmount = optionalFiniteNumber(amount, 'amount');
    if (safeAmount !== undefined && safeAmount <= 0) throw new Error('amount must be greater than 0');
    const safePromiseDate = optionalDate(promiseDate, 'promiseDate');

    const recCase = db.getCaseById(safeCaseId);
    if (!recCase) {
      return NextResponse.json(
        { error: `Case ${safeCaseId} not found` },
        { status: 404 }
      );
    }

    // Handle promise follow-up actions
    switch (safeAction) {
      case 'CREATE': {
        const existingPromise = db.getPromiseByCaseId(safeCaseId);
        if (existingPromise) {
          return NextResponse.json({ success: true, idempotent: true, message: `Promise already exists for case ${safeCaseId}`, promise: existingPromise });
        }
        const pDate = safePromiseDate || new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
        const pAmt = safeAmount ?? recCase.amount;
        const pChan = channel || 'WhatsApp / SMS';
        const newPromise = {
          id: `prom_${Date.now().toString().slice(-6)}`,
          case_id: safeCaseId,
          customer_name: recCase.customer_name,
          amount: pAmt,
          promise_date: pDate,
          status: 'PROMISED' as const,
          channel: pChan,
          created_at: new Date().toISOString()
        };
        db.addPromise(newPromise);

        recCase.status = 'ACTION_IN_PROGRESS';
        recCase.current_step = 'PROMISE_TO_PAY_LOGGED';
        db.saveCase(recCase);

        db.addAudit({
          id: `aud_ptp_create_${Date.now()}`,
          case_id: safeCaseId,
          timestamp: new Date().toISOString(),
          stage: 'EXECUTE_ACTION',
          actor: 'RECOVER_AI_ENGINE',
          action: 'PROMISE_TO_PAY_REGISTERED',
          result: 'ACTION_EXECUTED',
          details: `Formal promise-to-pay registered: ₹${pAmt.toLocaleString('en-IN')} committed for settlement on ${pDate} via ${pChan}.`
        });
        await db.flushDurableState();

        return NextResponse.json({
          success: true,
          message: `Promise created for case ${safeCaseId}`,
          promise: newPromise,
        });
      }

      case 'MARK_KEPT': {
        if (recCase.status !== 'RECOVERED') {
          db.settleCase(safeCaseId, db.getPromiseByCaseId(safeCaseId)?.amount || recCase.amount, 'PROMISE_TO_PAY_SETTLED_VERIFIED');
        }
        db.updatePromiseStatus(safeCaseId, 'KEPT');
        await db.flushDurableState();

        return NextResponse.json({
          success: true,
          message: `Promise for case ${safeCaseId} marked as KEPT and ledger updated`,
          caseId: safeCaseId,
          action,
          updatedStatus: recCase.status,
        });
      }

      case 'MARK_BROKEN': {
        db.updatePromiseStatus(safeCaseId, 'BROKEN');
        if (recCase.status !== 'ESCALATED') {
          recCase.status = 'ESCALATED';
          recCase.current_step = 'ESCALATED_BROKEN_PROMISE';
          recCase.escalation_reason = 'Promise-to-pay commitment breached. High financial risk escalation.';
          recCase.escalated_to = 'Commercial Collections Specialist';
          db.saveCase(recCase);

          db.addEscalation({
            id: `esc_ptp_${Date.now().toString().slice(-6)}`,
            case_id: safeCaseId,
            customer_name: recCase.customer_name,
            amount: recCase.amount,
            playbook: recCase.playbook,
            reason: recCase.escalation_reason,
            risk_score: Math.min(100, recCase.customer_risk_score + 25),
            status: 'PENDING',
            assigned_to: 'Commercial Collections Specialist',
            created_at: new Date().toISOString(),
          });

          db.addAudit({
            id: `aud_ptp_broken_${Date.now()}`,
            case_id: safeCaseId,
            timestamp: new Date().toISOString(),
            stage: 'STOP_OR_ESCALATE',
            actor: 'GUARDRAIL_COMPLIANCE_MONITOR',
            action: 'PROMISE_BREACHED_ESCALATED',
            result: 'ESCALATED',
            details: `Customer breached payment promise. Case escalated to Commercial Collections Specialist.`
          });
        }
        await db.flushDurableState();
        return NextResponse.json({
          success: true,
          message: `Promise for case ${safeCaseId} marked as BROKEN and escalated`,
          caseId: safeCaseId,
          action,
          updatedStatus: recCase.status,
        });
      }

      case 'SEND_REMINDER': {
        db.addAudit({
          id: `aud_ptp_remind_${Date.now()}`,
          case_id: safeCaseId,
          timestamp: new Date().toISOString(),
          stage: 'EXECUTE_ACTION',
          actor: 'RECOVER_AI_ENGINE',
          action: 'PROMISE_REMINDER_SENT',
          result: 'ACTION_EXECUTED',
          details: `Autonomous reminder dispatched to ${recCase.customer_email} for committed ₹${recCase.amount.toLocaleString('en-IN')}.`,
        });
        await db.flushDurableState();
        return NextResponse.json({
          success: true,
          message: `Reminder sent for case ${caseId}`,
          caseId: safeCaseId,
          action,
        });
      }

      case 'RESCHEDULE': {
        recCase.status = 'ACTION_IN_PROGRESS';
        recCase.current_step = 'PROMISE_RESCHEDULED';
        db.saveCase(recCase);
        db.updatePromiseStatus(safeCaseId, 'RESCHEDULED');

        db.addAudit({
          id: `aud_ptp_reschedule_${Date.now()}`,
          case_id: safeCaseId,
          timestamp: new Date().toISOString(),
          stage: 'EXECUTE_ACTION',
          actor: 'RECOVER_AI_ENGINE',
          action: 'PROMISE_RESCHEDULED',
          result: 'ACTION_EXECUTED',
          details: `Promise-to-pay schedule extended with customer agreement for case ${caseId}.`,
        });
        await db.flushDurableState();
        return NextResponse.json({
          success: true,
          message: `Promise for case ${safeCaseId} rescheduled`,
          caseId: safeCaseId,
          action,
          updatedStatus: recCase.status,
        });
      }

      default:
        return NextResponse.json(
          { error: `Unknown action: ${safeAction}. Valid actions: CREATE, MARK_KEPT, MARK_BROKEN, SEND_REMINDER, RESCHEDULE` },
          { status: 400 }
        );
    }
  } catch (err: any) {
    return NextResponse.json(
      { error: errorMessage(err, 'Failed to process promise action') },
      { status: 500 }
    );
  }
}
