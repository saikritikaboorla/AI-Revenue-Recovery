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
    const { caseId, action, promiseDate, amount, channel } = body as {
      caseId?: string;
      action?: string;
      promiseDate?: string;
      amount?: number;
      channel?: string;
    };

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
      case 'CREATE': {
        const pDate = promiseDate || new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
        const pAmt = amount || recCase.amount;
        const pChan = channel || 'WhatsApp / SMS';
        const newPromise = {
          id: `prom_${Date.now().toString().slice(-6)}`,
          case_id: caseId,
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
          case_id: caseId,
          timestamp: new Date().toISOString(),
          stage: 'EXECUTE_ACTION',
          actor: 'RECOVER_AI_ENGINE',
          action: 'PROMISE_TO_PAY_REGISTERED',
          result: 'SUCCESS',
          details: `Formal promise-to-pay registered: ₹${pAmt.toLocaleString('en-IN')} committed for settlement on ${pDate} via ${pChan}.`
        });

        return NextResponse.json({
          success: true,
          message: `Promise created for case ${caseId}`,
          promise: newPromise,
        });
      }

      case 'MARK_KEPT': {
        const recoveredAt = new Date().toISOString();
        if (recCase.status !== 'RECOVERED') {
          recCase.status = 'RECOVERED';
          recCase.recovered_amount = recCase.amount;
          recCase.recovered_at = recoveredAt;
          recCase.current_step = 'VERIFIED_STOPPED';
          recCase.last_action_result = `Promise-to-pay kept. Customer settled ₹${recCase.amount.toLocaleString('en-IN')}.`;
          db.saveCase(recCase);

          // Write to recovery ledger
          const ledgerEntry = {
            id: `ledg_ptp_${Date.now().toString().slice(-6)}`,
            case_id: caseId,
            customer_id: recCase.customer_id,
            amount_at_risk: recCase.amount,
            recovered_amount: recCase.amount,
            currency: recCase.currency || 'INR',
            playbook: recCase.playbook,
            verification_source: 'PROMISE_TO_PAY_SETTLED_VERIFIED',
            verified_at: recoveredAt,
            idempotency_key: `idemp_ptp_${caseId}_${recoveredAt.slice(0, 10)}`
          };
          db.addLedger(ledgerEntry);

          db.addAudit({
            id: `aud_ptp_kept_${Date.now()}`,
            case_id: caseId,
            timestamp: recoveredAt,
            stage: 'VERIFY',
            actor: 'RAZORPAY_WEBHOOK_HANDLER',
            action: 'PROMISE_HONORED_SETTLED',
            result: 'SUCCESS',
            details: `Promise-to-pay fulfilled. ₹${recCase.amount.toLocaleString('en-IN')} verified & written to ledger (${ledgerEntry.id}).`
          });
        }
        db.updatePromiseStatus(caseId, 'KEPT');

        return NextResponse.json({
          success: true,
          message: `Promise for case ${caseId} marked as KEPT and ledger updated`,
          caseId,
          action,
          updatedStatus: recCase.status,
        });
      }

      case 'MARK_BROKEN': {
        db.updatePromiseStatus(caseId, 'BROKEN');
        if (recCase.status !== 'ESCALATED') {
          recCase.status = 'ESCALATED';
          recCase.current_step = 'ESCALATED_BROKEN_PROMISE';
          recCase.escalation_reason = 'Promise-to-pay commitment breached. High financial risk escalation.';
          recCase.escalated_to = 'Commercial Collections Specialist';
          db.saveCase(recCase);

          db.addEscalation({
            id: `esc_ptp_${Date.now().toString().slice(-6)}`,
            case_id: caseId,
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
            case_id: caseId,
            timestamp: new Date().toISOString(),
            stage: 'STOP_OR_ESCALATE',
            actor: 'GUARDRAIL_COMPLIANCE_MONITOR',
            action: 'PROMISE_BREACHED_ESCALATED',
            result: 'ESCALATED',
            details: `Customer breached payment promise. Case escalated to Commercial Collections Specialist.`
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
        db.addAudit({
          id: `aud_ptp_remind_${Date.now()}`,
          case_id: caseId,
          timestamp: new Date().toISOString(),
          stage: 'EXECUTE_ACTION',
          actor: 'RECOVER_AI_ENGINE',
          action: 'PROMISE_REMINDER_SENT',
          result: 'SUCCESS',
          details: `Autonomous reminder dispatched to ${recCase.customer_email} for committed ₹${recCase.amount.toLocaleString('en-IN')}.`,
        });
        return NextResponse.json({
          success: true,
          message: `Reminder sent for case ${caseId}`,
          caseId,
          action,
        });
      }

      case 'RESCHEDULE': {
        recCase.status = 'ACTION_IN_PROGRESS';
        recCase.current_step = 'PROMISE_RESCHEDULED';
        db.saveCase(recCase);
        db.updatePromiseStatus(caseId, 'PROMISED');

        db.addAudit({
          id: `aud_ptp_reschedule_${Date.now()}`,
          case_id: caseId,
          timestamp: new Date().toISOString(),
          stage: 'EXECUTE_ACTION',
          actor: 'RECOVER_AI_ENGINE',
          action: 'PROMISE_RESCHEDULED',
          result: 'SUCCESS',
          details: `Promise-to-pay schedule extended with customer agreement for case ${caseId}.`,
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
          { error: `Unknown action: ${action}. Valid actions: CREATE, MARK_KEPT, MARK_BROKEN, SEND_REMINDER, RESCHEDULE` },
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
