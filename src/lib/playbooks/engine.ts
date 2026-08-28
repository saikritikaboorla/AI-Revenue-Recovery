import { db, RecoveryCaseRecord, AuditRecord, EscalationRecord } from '../db';
import { PlaybookType, PLAYBOOK_CONFIGS } from './index';
import { createAIDecision } from '../ai-decision';
import { formatRetryStatus } from '../guardrails';

export interface ExecutionResult {
  success: boolean;
  case: RecoveryCaseRecord;
  recovered: boolean;
  escalated: boolean;
  stopped: boolean;
  reason: string;
  auditTrail: AuditRecord[];
}

export class RecoveryPipeline {
  /**
   * Executes full end-to-end recovery pipeline for a specific case:
   * EVENT -> DETECT -> DIAGNOSE -> RISK SCORE -> DECIDE PLAYBOOK -> CHECK GUARDRAILS -> EXECUTE ACTION -> VERIFY -> RECOVERY LEDGER -> AUDIT -> STOP/ESCALATE
   */
  public static async processCase(caseId: string, options?: { forceApproval?: boolean }): Promise<ExecutionResult> {
    const recCase = db.getCaseById(caseId);
    if (!recCase) {
      throw new Error(`Case ${caseId} not found`);
    }

    const now = new Date().toISOString();
    const generatedAudits: AuditRecord[] = [];

    // Terminal state protection: if already recovered or stopped, do not re-run
    if (recCase.status === 'RECOVERED') {
      return {
        success: true,
        case: recCase,
        recovered: true,
        escalated: false,
        stopped: true,
        reason: `Case is already verified and recovered (₹${(recCase.recovered_amount || recCase.amount).toLocaleString('en-IN')})`,
        auditTrail: db.getAuditsByCaseId(caseId)
      };
    }

    if (recCase.status === 'STOPPED_MAX_RETRIES' || recCase.status === 'STOPPED_UNRECOVERABLE') {
      return {
        success: false,
        case: recCase,
        recovered: false,
        escalated: false,
        stopped: true,
        reason: `Case reached terminal state: ${recCase.status}`,
        auditTrail: db.getAuditsByCaseId(caseId)
      };
    }

    const guardrails = db.getGuardrails();
    const config = PLAYBOOK_CONFIGS[recCase.playbook];
    const customer = db.getCustomerById(recCase.customer_id);
    const aiDecision = createAIDecision(recCase, guardrails, customer);
    recCase.ai_decision = aiDecision;

    // Stage 0: Record DETECT if not present
    const existingAudits = db.getAuditsByCaseId(caseId);
    if (!existingAudits.some(a => a.stage === 'DETECT')) {
      const detectAudit: AuditRecord = {
        id: `aud_${recCase.id}_det_${Date.now()}`,
        case_id: recCase.id,
        timestamp: recCase.created_at || now,
        stage: 'DETECT',
        actor: 'RECOVERAI_AUTOMATION_ENGINE',
        action: 'REVENUE_AT_RISK_DETECTED',
        result: 'SUCCESS',
        details: `Signal detected: ₹${recCase.amount.toLocaleString('en-IN')} at risk for ${recCase.customer_name}. Reason: ${recCase.failure_reason}`
      };
      db.addAudit(detectAudit);
      generatedAudits.push(detectAudit);
    }

    // Stage 1: DIAGNOSE & RISK SCORE
    recCase.status = 'DIAGNOSING';
    recCase.current_step = 'DIAGNOSING';
    
    let diagnosis = `Analyzed root cause: ${recCase.failure_reason}. Customer risk score: ${recCase.customer_risk_score}/100. Segment: ${recCase.customer_segment}.`;
    let rationale = `Selected Playbook [${config.displayName}] due to ${recCase.failure_reason}.`;

    if (recCase.playbook === 'HINGLISH_RECOVERY') {
      diagnosis += ' Customer dropped out during mobile UPI intent step. Hinglish conversational recovery matched.';
      rationale = 'Dispatched bilingual (Hinglish) interactive payment prompt over WhatsApp Cloud API.';
    } else if (recCase.playbook === 'PROMISE_TO_PAY') {
      diagnosis += ' Deferred settlement schedule logged. Setting automated P2P calendar milestone.';
      rationale = 'Recorded promise-to-pay commitment. Enforcing milestone verification before cooldown.';
    }

    recCase.diagnosis_summary = diagnosis;
    recCase.rationale = rationale;

    const diagAudit: AuditRecord = {
      id: `aud_${recCase.id}_diag_${Date.now()}`,
      case_id: recCase.id,
      timestamp: now,
      stage: 'DIAGNOSE',
      actor: 'RECOVERAI_DIAGNOSTIC_RULES',
      action: 'DIAGNOSIS_FORMULATED',
      result: 'SUCCESS',
      details: diagnosis
    };
    db.addAudit(diagAudit);
    generatedAudits.push(diagAudit);

    db.addAudit({
      id: `aud_${recCase.id}_dec_${Date.now()}`,
      case_id: recCase.id,
      timestamp: aiDecision.timestamp,
      stage: 'DECIDE_PLAYBOOK',
      actor: 'RECOVERAI_DECISION_ENGINE',
      action: 'STRUCTURED_PLAYBOOK_DECISION',
      result: aiDecision.escalationRequired ? 'ESCALATED' : 'SUCCESS',
      details: `${aiDecision.detectedIssue}. ${aiDecision.expectedOutcome}`,
      metadata: { aiDecision },
    });
    generatedAudits.push(db.getAuditsByCaseId(caseId).slice(-1)[0]);

    // Stage 2: DECIDE PLAYBOOK & CHECK GUARDRAILS
    recCase.status = 'DECIDED';
    recCase.current_step = 'CHECK_GUARDRAILS';

    const retryLimitPassed = recCase.retry_count < (config?.maxRetries || guardrails.maxRetries);
    const riskThresholdPassed = recCase.customer_risk_score <= guardrails.maxRiskScoreForAutonomousAction;
    const valueCeilingPassed = recCase.amount <= guardrails.highValueThreshold;

    const guardrailPassed = retryLimitPassed && riskThresholdPassed && valueCeilingPassed;

    // Check if Human Escalation is triggered
    if (!guardrailPassed && !options?.forceApproval) {
      recCase.status = 'ESCALATED';
      recCase.current_step = 'ESCALATED_HUMAN_APPROVAL';
      recCase.requires_human_approval = true;
      
      let escReason = 'Guardrail trigger: ';
      if (!retryLimitPassed) escReason += `${formatRetryStatus(recCase.retry_count, config?.maxRetries || guardrails.maxRetries)}. `;
      if (!riskThresholdPassed) escReason += `Risk score (${recCase.customer_risk_score}) exceeds ceiling (${guardrails.maxRiskScoreForAutonomousAction}). `;
      if (!valueCeilingPassed) escReason += `Amount (₹${recCase.amount.toLocaleString('en-IN')}) exceeds high-value threshold (₹${guardrails.highValueThreshold.toLocaleString('en-IN')}). `;

      recCase.escalation_reason = escReason;
      recCase.escalated_to = 'Senior FinTech Operations Manager';

      const escAudit: AuditRecord = {
        id: `aud_${recCase.id}_esc_${Date.now()}`,
        case_id: recCase.id,
        timestamp: new Date().toISOString(),
        stage: 'CHECK_GUARDRAILS',
        actor: 'GUARDRAIL_COMPLIANCE_MONITOR',
        action: 'HUMAN_APPROVAL_TRIGGERED',
        result: 'ESCALATED',
        details: escReason
      };
      db.addAudit(escAudit);
      generatedAudits.push(escAudit);

      const escRecord: EscalationRecord = {
        id: `esc_${Date.now().toString().slice(-4)}`,
        case_id: recCase.id,
        customer_name: recCase.customer_name,
        amount: recCase.amount,
        playbook: recCase.playbook,
        reason: escReason,
        risk_score: recCase.customer_risk_score,
        status: 'PENDING',
        assigned_to: recCase.escalated_to,
        created_at: new Date().toISOString()
      };
      db.addEscalation(escRecord);
      db.saveCase(recCase);

      return {
        success: true,
        case: recCase,
        recovered: false,
        escalated: true,
        stopped: false,
        reason: escReason,
        auditTrail: generatedAudits
      };
    }

    // Stage 3: EXECUTE BOUNDED ACTION
    recCase.status = 'ACTION_IN_PROGRESS';
    recCase.current_step = 'EXECUTE_ACTION';
    recCase.retry_count += 1;

    const action = aiDecision.selectedAction === 'human_review'
      ? (config.allowedActions[0] || 'smart_retry_payment')
      : aiDecision.selectedAction;
    recCase.last_action = action;

    const actAudit: AuditRecord = {
      id: `aud_${recCase.id}_act_${Date.now()}`,
      case_id: recCase.id,
      timestamp: new Date().toISOString(),
      stage: 'EXECUTE_ACTION',
      actor: 'RECOVERAI_PLAYBOOK_RUNNER',
      action: `EXECUTED_${action.toUpperCase()}`,
      result: 'SUCCESS',
      details: `Dispatched bounded intervention [${action}] across Razorpay verified rails.`
    };
    db.addAudit(actAudit);
    generatedAudits.push(actAudit);

    // Stage 4: SIMULATE/VERIFY PROVIDER RESULT & WRITE TO RECOVERY LEDGER
    recCase.current_step = 'VERIFY';

    // Realistic outcome determined by customer recovery history and risk
    const winProbability = Math.max(0.3, Math.min(0.95, (100 - recCase.customer_risk_score) / 100 + 0.15));
    const isSuccess = Math.random() < winProbability;

    if (isSuccess) {
      const ledgerEntry = db.settleCase(recCase.id, recCase.amount, 'RAZORPAY_WEBHOOK_VERIFIED');

      /* legacy implementation retained for reference:
      const legacyLedgerEntry: any = {
      // Scope the ledger key to the case so fast batch executions cannot
      // overwrite one another when they happen in the same millisecond.
      id: `ledg_${recCase.id}_${Date.now().toString().slice(-6)}`,
        case_id: recCase.id,
        customer_id: recCase.customer_id,
        amount_at_risk: recCase.amount,
        recovered_amount: recCase.recovered_amount,
        currency: recCase.currency,
        playbook: recCase.playbook,
        verification_source: 'RAZORPAY_WEBHOOK_VERIFIED',
        verified_at: recCase.recovered_at,
        idempotency_key: `idemp_${recCase.id}_${recCase.recovered_at.slice(0, 10)}`
      };
      db.addLedger(legacyLedgerEntry); */

      /* const legacyVerificationAudit: AuditRecord = {
        id: `aud_${recCase.id}_ver_${Date.now()}`,
        case_id: recCase.id,
        timestamp: recCase.recovered_at || new Date().toISOString(),
        stage: 'VERIFY',
        actor: 'RAZORPAY_WEBHOOK_HANDLER',
        action: 'PAYMENT_CAPTURED_AND_VERIFIED',
        result: 'SUCCESS',
        details: `₹${recCase.amount.toLocaleString('en-IN')} captured. Ledger entry created: ${ledgerEntry.id}`
      }; */

      const stopAudit: AuditRecord = {
        id: `aud_${recCase.id}_stop_${Date.now()}`,
        case_id: recCase.id,
        timestamp: recCase.recovered_at || new Date().toISOString(),
        stage: 'STOP_OR_ESCALATE',
        actor: 'RECOVERAI_AUTOMATION_ENGINE',
        action: 'WORKFLOW_CLOSED_SUCCESSFULLY',
        result: 'SUCCESS',
        details: `Closed-loop workflow terminated cleanly. Money recovered and accounted.`
      };

      db.addAudit(stopAudit);
      const verificationAudit = db.getAuditsByCaseId(recCase.id).find(a => a.action === 'SETTLEMENT_VERIFIED_AND_LEDGER_WRITTEN');
      if (verificationAudit) generatedAudits.push(verificationAudit);
      generatedAudits.push(stopAudit);

      return {
        success: true,
        case: recCase,
        recovered: true,
        escalated: false,
        stopped: true,
        reason: `Successfully recovered ₹${recCase.amount.toLocaleString('en-IN')}`,
        auditTrail: generatedAudits
      };
    } else {
      if (recCase.retry_count >= guardrails.maxRetries) {
        recCase.status = 'ESCALATED';
        recCase.current_step = 'ESCALATED_MAX_RETRIES';
        recCase.escalation_reason = `${formatRetryStatus(recCase.retry_count, config?.maxRetries || guardrails.maxRetries)}.`;
        recCase.escalated_to = 'Commercial Operations Lead';

        const stopAudit: AuditRecord = {
          id: `aud_${recCase.id}_stop_${Date.now()}`,
          case_id: recCase.id,
          timestamp: new Date().toISOString(),
          stage: 'STOP_OR_ESCALATE',
          actor: 'GUARDRAIL_COMPLIANCE_MONITOR',
          action: 'RETRIES_EXHAUSTED_ESCALATED',
          result: 'ESCALATED',
          details: recCase.escalation_reason
        };
        db.addAudit(stopAudit);
        generatedAudits.push(stopAudit);
      } else {
        recCase.status = 'ACTION_IN_PROGRESS';
        recCase.current_step = 'COOLDOWN_SCHEDULED';
        recCase.last_action_result = 'Attempt unacknowledged. Cooldown timer set before next bounded retry.';
      }

      db.saveCase(recCase);
      return {
        success: false,
        case: recCase,
        recovered: false,
        escalated: recCase.status === 'ESCALATED',
        stopped: recCase.status === 'ESCALATED',
        reason: recCase.last_action_result || 'Intervention pending settlement',
        auditTrail: generatedAudits
      };
    }
  }

  /**
   * Batch simulation processor that processes a given number of cases across all 7 playbooks
   */
  public static async runBatch(config: { batchSize: number; playbookFilter?: string }): Promise<{
    batchId: string;
    totalProcessed: number;
    totalAtRisk: number;
    totalRecovered: number;
    recoveryRatePct: number;
    escalatedCount: number;
    playbookDistribution: Record<string, number>;
  }> {
    const size = Math.min(Math.max(config.batchSize || 10, 2), 50);
    const cases = db.getCases({ playbook: config.playbookFilter, status: 'ACTION_IN_PROGRESS' }).slice(0, size);
    
    // If not enough active cases, grab detected cases
    if (cases.length < size) {
      const detected = db.getCases({ playbook: config.playbookFilter, status: 'DETECTED' }).slice(0, size - cases.length);
      cases.push(...detected);
    }

    let totalAtRisk = 0;
    let totalRecovered = 0;
    let escalatedCount = 0;
    const dist: Record<string, number> = {};

    for (const c of cases) {
      totalAtRisk += c.amount;
      dist[c.playbook] = (dist[c.playbook] || 0) + 1;
      const res = await this.processCase(c.id);
      if (res.recovered) {
        totalRecovered += (res.case.recovered_amount || res.case.amount);
      } else if (res.escalated) {
        escalatedCount += 1;
      }
    }

    const rate = totalAtRisk > 0 ? Number(((totalRecovered / totalAtRisk) * 100).toFixed(1)) : 0;

    return {
      batchId: `BATCH-${Date.now().toString().slice(-6)}`,
      totalProcessed: cases.length,
      totalAtRisk,
      totalRecovered,
      recoveryRatePct: rate,
      escalatedCount,
      playbookDistribution: dist
    };
  }
}
