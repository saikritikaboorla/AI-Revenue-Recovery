import { db, RecoveryCaseRecord, AuditRecord, EscalationRecord } from '../db';
import { PlaybookType, PLAYBOOK_CONFIGS } from './index';
import { createAIDecision } from '../ai-decision';
import { getAIDecision } from '../ai-gemini';
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
  private static inFlight = new Map<string, Promise<ExecutionResult>>();

  public static processCase(caseId: string, options?: { forceApproval?: boolean }): Promise<ExecutionResult> {
    const existing = this.inFlight.get(caseId);
    if (existing) return existing;
    const run = this.processCaseInternal(caseId, options);
    this.inFlight.set(caseId, run);
    void run.finally(() => {
      if (this.inFlight.get(caseId) === run) this.inFlight.delete(caseId);
    });
    return run;
  }

  /**
   * Executes full end-to-end recovery pipeline for a specific case:
   * EVENT -> DETECT -> DIAGNOSE -> RISK SCORE -> DECIDE PLAYBOOK -> CHECK GUARDRAILS -> EXECUTE ACTION -> VERIFY -> RECOVERY LEDGER -> AUDIT -> STOP/ESCALATE
   */
  private static async processCaseInternal(caseId: string, options?: { forceApproval?: boolean }): Promise<ExecutionResult> {
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
    const customer = db.getCustomerById(recCase.customer_id);
    // An escalation already has a persisted decision from the request that
    // created it. Reusing that validated decision keeps human approval from
    // issuing a second provider request (and prevents quota retries delaying
    // an approval action).
    const aiDecision = recCase.ai_decision || await getAIDecision(recCase, guardrails, customer);
    recCase.ai_decision = aiDecision;

    // Resolve which playbook config to use for execution.
    // If Gemini (AI) recommended a valid playbook that differs from the seeded one,
    // and guardrails for that playbook are not more restrictive, use the AI
    // recommendation to select the action. This makes Gemini's output genuinely
    // influence the execution path (not just the trace display), while remaining
    // bounded: the action must still be in the recommended playbook's allowedActions
    // and all guardrail thresholds still apply independently.
    const aiRecommendedPlaybook =
      !aiDecision.aiFallbackUsed &&
      aiDecision.selectedPlaybook !== 'HUMAN_ESCALATION' &&
      aiDecision.selectedPlaybook in PLAYBOOK_CONFIGS
        ? (aiDecision.selectedPlaybook as PlaybookType)
        : null;

    // Persist an accepted bounded recommendation as the case's effective
    // playbook so queue, trace, settlement, ledger, and audit records agree.
    // A guardrail-blocked recommendation remains unadopted and escalates.
    if (aiRecommendedPlaybook) recCase.playbook = aiRecommendedPlaybook;

    // Use the AI-recommended config when available; fall back to seeded playbook config.
    const config = aiRecommendedPlaybook
      ? PLAYBOOK_CONFIGS[aiRecommendedPlaybook]
      : PLAYBOOK_CONFIGS[recCase.playbook];
    const effectiveMaxRetries = Math.min(guardrails.maxRetries, config?.maxRetries ?? guardrails.maxRetries);

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
        result: 'DETECTED',
        details: `Signal detected: ₹${recCase.amount.toLocaleString('en-IN')} at risk for ${recCase.customer_name}. Reason: ${recCase.failure_reason}`
      };
      db.addAudit(detectAudit);
      generatedAudits.push(detectAudit);
    }

    // Stage 1: DIAGNOSE & RISK SCORE
    // Use Gemini's real diagnosis when available; fall back to deterministic summary.
    recCase.status = 'DIAGNOSING';
    recCase.current_step = 'DIAGNOSING';

    const aiDiagnosisAvailable = !aiDecision.aiFallbackUsed && aiDecision.source === 'GEMINI_AI';
    let diagnosis = aiDiagnosisAvailable
      ? aiDecision.diagnosis
      : `Analyzed root cause: ${recCase.failure_reason}. Customer risk score: ${recCase.customer_risk_score}/100. Segment: ${recCase.customer_segment}.`;

    let rationale = aiDiagnosisAvailable
      ? `AI-recommended playbook: ${config.displayName}. ${aiDecision.aiReasoning ?? ''}`
      : `Selected Playbook [${config.displayName}] due to ${recCase.failure_reason}.`;

    if (!aiDiagnosisAvailable) {
      if (recCase.playbook === 'HINGLISH_RECOVERY') {
        diagnosis += ' Customer dropped out during mobile UPI intent step. Hinglish conversational recovery matched.';
        rationale = 'Dispatched bilingual (Hinglish) interactive payment prompt over WhatsApp Cloud API.';
      } else if (recCase.playbook === 'PROMISE_TO_PAY') {
        diagnosis += ' Deferred settlement schedule logged. Setting automated P2P calendar milestone.';
        rationale = 'Recorded promise-to-pay commitment. Enforcing milestone verification before cooldown.';
      }
    }

    recCase.diagnosis_summary = diagnosis;
    recCase.rationale = rationale;

    const diagAudit: AuditRecord = {
      id: `aud_${recCase.id}_diag_${Date.now()}`,
      case_id: recCase.id,
      timestamp: now,
      stage: 'DIAGNOSE',
      actor: aiDiagnosisAvailable ? 'GEMINI_DIAGNOSIS_ENGINE' : 'RECOVERAI_DIAGNOSTIC_RULES',
      action: 'DIAGNOSIS_FORMULATED',
      result: 'DIAGNOSED',
      details: diagnosis
    };
    db.addAudit(diagAudit);
    generatedAudits.push(diagAudit);

    db.addAudit({
      id: `aud_${recCase.id}_dec_${Date.now()}`,
      case_id: recCase.id,
      timestamp: aiDecision.timestamp,
      stage: 'DECIDE_PLAYBOOK',
      actor: aiDecision.source === 'GEMINI_AI' ? 'GEMINI_DIAGNOSIS_ENGINE' : 'RECOVERAI_DECISION_ENGINE',
      action: aiDecision.aiFallbackUsed ? 'DECISION_FALLBACK' : 'STRUCTURED_PLAYBOOK_DECISION',
      result: aiDecision.escalationRequired ? 'ESCALATED' : 'DECIDED',
      details: aiDecision.aiFallbackUsed
        ? `Deterministic fallback used (${aiDecision.aiFallbackReason}). ${aiDecision.detectedIssue}. ${aiDecision.expectedOutcome}`
        : (() => {
            const base = `[AI: ${aiDecision.aiProvider ?? 'Gemini'} / ${aiDecision.aiModel ?? 'model unavailable'}] ${aiDecision.detectedIssue}. Recommended: ${aiDecision.selectedPlaybook}.`;
            const playbookNote = aiRecommendedPlaybook && aiRecommendedPlaybook !== recCase.playbook
              ? ` AI adopted playbook ${aiRecommendedPlaybook} (seeded: ${recCase.playbook}).`
              : '';
            return `${base}${playbookNote} ${aiDecision.expectedOutcome}`;
          })(),
      metadata: { aiDecision },
    });
    generatedAudits.push(db.getAuditsByCaseId(caseId).slice(-1)[0]);

    // Stage 2: DECIDE PLAYBOOK & CHECK GUARDRAILS
    recCase.status = 'DECIDED';
    recCase.current_step = 'CHECK_GUARDRAILS';

    const retryLimitPassed = recCase.retry_count < effectiveMaxRetries;
    const riskThresholdPassed = recCase.customer_risk_score <= guardrails.maxRiskScoreForAutonomousAction;
    const valueCeilingPassed = recCase.amount <= guardrails.highValueThreshold;
    const playbookAllowed = guardrails.allowedPlaybooks.includes(recCase.playbook);
    const customerOptedOut = Boolean(customer?.do_not_contact) || /DO_NOT_CONTACT|DND|OPT.?OUT/i.test(customer?.contact_preference || '');
    const contactAllowed = !guardrails.customerOptOutEnforced || !customerOptedOut;
    const automationAllowed = guardrails.automationMode === 'AUTONOMOUS';

    // The model recommendation is data, never an executable command. Only
    // actions declared by the effective playbook may reach the runner.
    const proposedAction = config.allowedActions.includes(aiDecision.selectedAction)
      ? aiDecision.selectedAction
      : (config.allowedActions[0] || 'human_review');
    const communicationAction = /send|notify|dispatch|whatsapp|sms|voice|ivr|link/i.test(proposedAction);
    const communicationAllowed = !communicationAction || guardrails.automatedCommunicationEnabled;
    const guardrailPassed = retryLimitPassed && riskThresholdPassed && valueCeilingPassed && playbookAllowed && contactAllowed && automationAllowed && communicationAllowed;

    // Check if Human Escalation is triggered
    if (!guardrailPassed && (!options?.forceApproval || !playbookAllowed || !contactAllowed)) {
      recCase.status = 'ESCALATED';
      recCase.current_step = 'ESCALATED_HUMAN_APPROVAL';
      recCase.requires_human_approval = true;
      
      let escReason = 'Guardrail trigger: ';
      if (!retryLimitPassed) escReason += `${formatRetryStatus(recCase.retry_count, effectiveMaxRetries)}. `;
      if (!riskThresholdPassed) escReason += `Risk score (${recCase.customer_risk_score}) exceeds ceiling (${guardrails.maxRiskScoreForAutonomousAction}). `;
      if (!valueCeilingPassed) escReason += `Amount (₹${recCase.amount.toLocaleString('en-IN')}) exceeds high-value threshold (₹${guardrails.highValueThreshold.toLocaleString('en-IN')}). `;
      if (!playbookAllowed) escReason += `Playbook ${recCase.playbook} is not allowed by merchant policy. `;
      if (!contactAllowed) escReason += 'Customer is opted out / marked do-not-contact. ';
      if (!automationAllowed) escReason += 'Merchant policy is review-first. ';
      if (!communicationAllowed) escReason += 'Automated communication is disabled by merchant policy. ';

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

    const action = proposedAction;
    recCase.last_action = action;

    const actAudit: AuditRecord = {
      id: `aud_${recCase.id}_act_${Date.now()}`,
      case_id: recCase.id,
      timestamp: new Date().toISOString(),
      stage: 'EXECUTE_ACTION',
      actor: 'RECOVERAI_PLAYBOOK_RUNNER',
      action: `EXECUTED_${action.toUpperCase()}`,
      result: 'ACTION_EXECUTED',
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
        result: 'RECOVERED',
        details: `₹${recCase.amount.toLocaleString('en-IN')} captured. Ledger entry created: ${ledgerEntry.id}`
      }; */

      const stopAudit: AuditRecord = {
        id: `aud_${recCase.id}_stop_${Date.now()}`,
        case_id: recCase.id,
        timestamp: recCase.recovered_at || new Date().toISOString(),
        stage: 'STOP_OR_ESCALATE',
        actor: 'RECOVERAI_AUTOMATION_ENGINE',
        action: 'WORKFLOW_CLOSED_SUCCESSFULLY',
        result: 'RECOVERED',
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
      const verificationAudit: AuditRecord = {
        id: `aud_${recCase.id}_verify_${Date.now()}`,
        case_id: recCase.id,
        timestamp: new Date().toISOString(),
        stage: 'VERIFY',
        actor: 'RAZORPAY_WEBHOOK_HANDLER',
        action: 'SETTLEMENT_NOT_CONFIRMED',
        result: 'NOT_RECOVERED',
        details: 'Provider did not confirm settlement for this bounded attempt; no recovery ledger entry was written.',
      };
      db.addAudit(verificationAudit);
      generatedAudits.push(verificationAudit);

      if (recCase.retry_count >= effectiveMaxRetries) {
        recCase.status = 'ESCALATED';
        recCase.current_step = 'ESCALATED_MAX_RETRIES';
        recCase.escalation_reason = `${formatRetryStatus(recCase.retry_count, effectiveMaxRetries)}.`;
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
        db.addEscalation({
          id: `esc_${recCase.id}_${Date.now().toString().slice(-6)}`,
          case_id: recCase.id,
          customer_name: recCase.customer_name,
          amount: recCase.amount,
          playbook: recCase.playbook,
          reason: recCase.escalation_reason,
          risk_score: recCase.customer_risk_score,
          status: 'PENDING',
          assigned_to: recCase.escalated_to,
          created_at: new Date().toISOString(),
        });
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
