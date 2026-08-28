import { RecoveryCase, AgentDecision, InterventionExecution, AuditEvent, InterventionType, GuardrailSettings } from './types';
import { store } from './store';

export interface WorkflowExecutionResult {
  success: boolean;
  case: RecoveryCase;
  recovered: boolean;
  escalated: boolean;
  stopped: boolean;
  reason: string;
}

export class RecoveryAgentEngine {
  /**
   * Evaluates failure reason, customer attributes and guardrails to decide the optimal recovery intervention.
   */
  public static diagnoseAndDecide(recCase: RecoveryCase, guardrails: GuardrailSettings): AgentDecision {
    const { transaction, customer, retryCount } = recCase;
    const now = new Date().toISOString();

    let selectedIntervention: InterventionType = 'SMART_RETRY_DOWNTIME_OPTIMAL';
    let rationale = '';
    let diagnosis = '';
    let recoveryConfidence = 75;
    let lossProbability = 0.5;

    // Guardrail pre-checks
    const maxRetriesUnderLimit = retryCount < guardrails.maxAutoRetries;
    const cooldownPeriodObserved = true;
    const customerContactLimitRespected = true;
    const financialRiskApproved = recCase.amount <= guardrails.maxInterventionAmountWithoutHumanReview;

    // Check if escalation is required by guardrails
    if (!maxRetriesUnderLimit || !financialRiskApproved) {
      selectedIntervention = 'HUMAN_OPS_ESCALATION';
      diagnosis = !maxRetriesUnderLimit 
        ? 'Maximum automated retry limits reached without customer settlement.'
        : 'Transaction value exceeds autonomous recovery threshold limits.';
      rationale = 'Escalated to human operations team for high-touch relationship intervention.';
      recoveryConfidence = 40;
      lossProbability = 0.85;
    } else {
      // Diagnostic Decision Matrix
      switch (transaction.category) {
        case 'PAYMENT_FAILURE':
          if (transaction.failureReason === 'BANK_DOWNTIME') {
            selectedIntervention = 'SWITCH_GATEWAY_RAZORPAYX';
            diagnosis = 'Transient banking node downtime detected. High probability of success on alternative UPI/Card gateway rail.';
            rationale = 'Auto-failover via Razorpay Optimizer route without disturbing the customer.';
            recoveryConfidence = 95;
            lossProbability = 0.80;
          } else if (transaction.failureReason === 'AUTH_FAILED_OTP_TIMEOUT') {
            if (customer.segment === 'HIGH_LTV_VIP' || customer.segment === 'ENTERPRISE') {
              selectedIntervention = 'AI_VOICE_IVR_AUTHORIZATION';
              diagnosis = 'High-value cardholder OTP latency. Customer actively engaged in checkout session.';
              rationale = 'Initiated real-time assisted Voice Bridge to supply instant 1-tap card re-authorization token.';
              recoveryConfidence = 90;
              lossProbability = 0.70;
            } else {
              selectedIntervention = 'SMS_FALLBACK_PAYMENT_URL';
              diagnosis = 'Customer OTP session timeout on mobile device.';
              rationale = 'Dispatched instant deep-link SMS with pre-authenticated cart token.';
              recoveryConfidence = 82;
              lossProbability = 0.65;
            }
          } else if (transaction.failureReason === 'INSUFFICIENT_FUNDS') {
            selectedIntervention = 'SMART_RETRY_DOWNTIME_OPTIMAL';
            diagnosis = 'Account balance deficit at time of execution.';
            rationale = 'Rescheduled retry for next business morning salary clearing window.';
            recoveryConfidence = 68;
            lossProbability = 0.60;
          } else {
            selectedIntervention = 'SWITCH_GATEWAY_RAZORPAYX';
            diagnosis = 'Standard network routing decline.';
            rationale = 'Rerouting payment attempt through secondary acquirer bank.';
            recoveryConfidence = 80;
            lossProbability = 0.70;
          }
          break;

        case 'CHECKOUT_ABANDONMENT':
          selectedIntervention = 'DYNAMIC_WHATSAPP_CHECKOUT_LINK';
          diagnosis = 'Customer abandoned active cart before authorization.';
          rationale = 'Dispatched conversational WhatsApp recovery link with 1-click UPI deep-link intent.';
          recoveryConfidence = 79;
          lossProbability = 0.88;
          break;

        case 'FAILED_SUBSCRIPTION':
          if (transaction.failureReason === 'MANDATE_LIMIT_EXCEEDED') {
            selectedIntervention = 'DYNAMIC_WHATSAPP_CHECKOUT_LINK';
            diagnosis = 'Recurring invoice amount breached statutory e-Mandate auto-debit cap (RBI threshold).';
            rationale = 'Generated instant 1-click AFA authentication link with digital invoice summary.';
            recoveryConfidence = 88;
            lossProbability = 0.75;
          } else {
            selectedIntervention = 'SMART_RETRY_DOWNTIME_OPTIMAL';
            diagnosis = 'Card cycle decline during subscription renewal.';
            rationale = 'Scheduled smart retry sequence with 24-hour spacing interval.';
            recoveryConfidence = 84;
            lossProbability = 0.60;
          }
          break;

        case 'MANDATE_RETRY':
          selectedIntervention = 'MANDATE_BATCH_RESCHEDULE';
          diagnosis = 'Inter-bank NACH / e-Mandate clearing rejection.';
          rationale = 'Re-queued into high-liquidity morning clearing batch cycle.';
          recoveryConfidence = 85;
          lossProbability = 0.55;
          break;

        case 'B2B_OVERDUE_RECEIVABLE':
          if (recCase.amount > 100000 || retryCount >= 2) {
            selectedIntervention = 'HUMAN_OPS_ESCALATION';
            diagnosis = 'B2B overdue invoice Net-30 breach exceeding single-agent autonomy scope.';
            rationale = 'Escalated to Commercial Accounts Director with audit trace.';
            recoveryConfidence = 52;
            lossProbability = 0.70;
          } else {
            selectedIntervention = 'B2B_STRUCTURED_DISCOUNT_PROMISE';
            diagnosis = 'Overdue receivable on credit terms. Customer has high historical reliability.';
            rationale = 'Dispatched dynamic 5% early cash settlement incentive with 48hr validity window.';
            recoveryConfidence = 74;
            lossProbability = 0.65;
          }
          break;
      }
    }

    const decision: AgentDecision = {
      id: `dec_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
      caseId: recCase.id,
      timestamp: now,
      diagnosis,
      lossProbability,
      recoveryConfidence: recoveryConfidence / 100,
      selectedIntervention,
      rationale,
      factors: [
        { factor: 'Customer Segment', impact: 'POSITIVE', weight: 0.35, description: `${customer.segment} tier (LTV: ₹${customer.lifetimeValue.toLocaleString('en-IN')})` },
        { factor: 'Historical Recovery', impact: customer.pastRecoverySuccessRate >= 70 ? 'POSITIVE' : 'NEUTRAL', weight: 0.30, description: `${customer.pastRecoverySuccessRate}% past win-back rate` },
        { factor: 'Risk Score', impact: customer.riskScore <= 30 ? 'POSITIVE' : 'NEGATIVE', weight: 0.35, description: `Score: ${customer.riskScore}/100` }
      ],
      guardrailsChecked: {
        maxRetriesUnderLimit,
        cooldownPeriodObserved,
        customerContactLimitRespected,
        financialRiskApproved
      }
    };

    return decision;
  }

  /**
   * Executes the selected recovery action via Razorpay adapter / dynamic channel
   */
  public static async executeIntervention(
    recCase: RecoveryCase, 
    decision: AgentDecision
  ): Promise<InterventionExecution> {
    const now = new Date().toISOString();
    const type = decision.selectedIntervention;

    let channel = 'Razorpay Core API';
    let details: Record<string, any> = {};
    let verificationMethod = 'Razorpay Webhook verification';
    let status: 'SUCCESS' | 'FAILED' | 'PENDING' = 'SUCCESS';

    switch (type) {
      case 'SWITCH_GATEWAY_RAZORPAYX':
        channel = 'Razorpay Optimizer Multi-Gateway';
        details = { failoverRoute: 'ICICI_UPI_SWITCH', autoCapture: true };
        verificationMethod = 'Instant Gateway Handshake & Capture';
        break;

      case 'DYNAMIC_WHATSAPP_CHECKOUT_LINK':
        channel = 'Meta WhatsApp Cloud API / Razorpay Links';
        details = { 
          linkUrl: `https://rzp.io/i/rec_${recCase.id.toLowerCase()}`, 
          template: 'recovery_payment_urgent',
          delivered: true 
        };
        verificationMethod = 'Payment Link Capture Webhook';
        break;

      case 'AI_VOICE_IVR_AUTHORIZATION':
        channel = 'RecoverAI Telephony Voice Gateway';
        details = { ivrSessionId: `ivr_${Date.now()}`, customerConfirmed: true };
        verificationMethod = 'Voice 2FA Authorization & Direct Debit';
        break;

      case 'SMART_RETRY_DOWNTIME_OPTIMAL':
      case 'MANDATE_BATCH_RESCHEDULE':
        channel = 'Razorpay Subscriptions / e-NACH Queue';
        details = { nextAttempt: 'Optimized morning liquidity window (06:00 AM)' };
        verificationMethod = 'Batch Settlement Confirmation Webhook';
        break;

      case 'B2B_STRUCTURED_DISCOUNT_PROMISE':
        channel = 'Razorpay Invoices + Corporate Email Gateway';
        details = { discountPct: '5%', paymentWindowDays: 2, promiseId: `p2p_${Date.now()}` };
        verificationMethod = 'Virtual Account Settlement Webhook';
        break;

      case 'SMS_FALLBACK_PAYMENT_URL':
        channel = 'Telecom SMS Gateway';
        details = { shortUrl: `https://rzp.io/s/${recCase.id.toLowerCase()}` };
        verificationMethod = 'SMS Payment Gateway Webhook';
        break;

      case 'HUMAN_OPS_ESCALATION':
        channel = 'Internal Ops Incident Management';
        details = { queue: 'High-Priority Revenue Recovery', assignedTeam: 'Enterprise Ops' };
        verificationMethod = 'Ops Manager Sign-off';
        break;
    }

    return {
      id: `int_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
      caseId: recCase.id,
      type,
      channel,
      initiatedAt: now,
      completedAt: new Date().toISOString(),
      status,
      details,
      verificationMethod,
      latencyMs: Math.floor(Math.random() * 800) + 200
    };
  }

  /**
   * Executes the full closed-loop agent recovery workflow on a case:
   * Detect -> Diagnose -> Decide -> Act -> Verify -> Stop/Escalate -> Audit
   */
  public static async processWorkflow(caseId: string): Promise<WorkflowExecutionResult> {
    const recCase = store.getCaseById(caseId);
    if (!recCase) {
      throw new Error(`Case ${caseId} not found`);
    }

    const guardrails = store.getGuardrails();
    const now = new Date().toISOString();

    // Stage 1: DIAGNOSE & DECIDE
    const decision = this.diagnoseAndDecide(recCase, guardrails);
    recCase.decisions.push(decision);
    recCase.recoveryConfidence = Math.round(decision.recoveryConfidence * 100);
    recCase.lastInterventionType = decision.selectedIntervention;

    const auditDecide: AuditEvent = {
      id: `aud_${Date.now()}_decide`,
      caseId: recCase.id,
      timestamp: now,
      stage: 'DECIDE',
      actor: 'RECOVER_AI_AUTONOMOUS_AGENT',
      details: `Decision formulated: ${decision.selectedIntervention} (Confidence: ${recCase.recoveryConfidence}%). Rationale: ${decision.rationale}`,
    };
    recCase.auditLogs.push(auditDecide);

    // Stage 2: ACT
    recCase.currentStep = 'ACTING';
    recCase.status = 'ACTION_IN_PROGRESS';
    const intervention = await this.executeIntervention(recCase, decision);
    recCase.interventions.push(intervention);
    recCase.retryCount += 1;

    const auditAct: AuditEvent = {
      id: `aud_${Date.now()}_act`,
      caseId: recCase.id,
      timestamp: new Date().toISOString(),
      stage: 'ACT',
      actor: 'RECOVER_AI_AUTONOMOUS_AGENT',
      details: `Executed intervention: ${intervention.type} via ${intervention.channel}. Details: ${JSON.stringify(intervention.details)}`,
    };
    recCase.auditLogs.push(auditAct);

    // Stage 3: VERIFY & TERMINATE / ESCALATE
    recCase.currentStep = 'VERIFYING';

    if (decision.selectedIntervention === 'HUMAN_OPS_ESCALATION') {
      recCase.status = 'ESCALATED';
      recCase.currentStep = 'ESCALATED';
      recCase.escalationReason = decision.diagnosis;
      recCase.escalatedTo = 'Senior Financial Operations Specialist';
      recCase.lastInterventionResult = 'Escalated to human relationship team under guardrail compliance.';

      const auditEscalate: AuditEvent = {
        id: `aud_${Date.now()}_esc`,
        caseId: recCase.id,
        timestamp: new Date().toISOString(),
        stage: 'ESCALATE',
        actor: 'GUARDRAIL_MONITOR',
        details: `Escalated to human ops: ${recCase.escalationReason}`,
      };
      recCase.auditLogs.push(auditEscalate);
      store.saveCase(recCase);

      return {
        success: true,
        case: recCase,
        recovered: false,
        escalated: true,
        stopped: false,
        reason: recCase.escalationReason
      };
    }

    // Determine realistic recovery outcome based on confidence
    const isSuccess = Math.random() < (decision.recoveryConfidence + 0.1);

    if (isSuccess) {
      recCase.status = 'RECOVERED';
      recCase.currentStep = 'COMPLETED';
      recCase.recoveredAmount = recCase.amount;
      recCase.recoveredAt = new Date().toISOString();
      recCase.lastInterventionResult = `Successfully verified via ${intervention.verificationMethod}. ₹${recCase.amount.toLocaleString('en-IN')} recovered.`;

      const auditVerify: AuditEvent = {
        id: `aud_${Date.now()}_ver`,
        caseId: recCase.id,
        timestamp: recCase.recoveredAt,
        stage: 'VERIFY',
        actor: 'RAZORPAY_WEBHOOK',
        details: `Payment verification succeeded: ₹${recCase.amount.toLocaleString('en-IN')} settled to merchant account.`,
      };
      const auditStop: AuditEvent = {
        id: `aud_${Date.now()}_stop`,
        caseId: recCase.id,
        timestamp: recCase.recoveredAt,
        stage: 'STOP',
        actor: 'RECOVER_AI_AUTONOMOUS_AGENT',
        details: `Recovery closed successfully. Closed loop complete.`,
      };
      recCase.auditLogs.push(auditVerify, auditStop);
      store.saveCase(recCase);

      return {
        success: true,
        case: recCase,
        recovered: true,
        escalated: false,
        stopped: true,
        reason: `Recovered ₹${recCase.amount.toLocaleString('en-IN')}`
      };
    } else {
      if (recCase.retryCount >= recCase.maxRetriesAllowed) {
        recCase.status = 'ESCALATED';
        recCase.currentStep = 'ESCALATED';
        recCase.escalationReason = `Exceeded max retry attempts (${recCase.retryCount}/${recCase.maxRetriesAllowed})`;
        recCase.escalatedTo = 'Customer Support Lead';
        recCase.lastInterventionResult = 'Intervention unacknowledged. Max attempts exhausted; escalated.';

        const auditMax: AuditEvent = {
          id: `aud_${Date.now()}_max`,
          caseId: recCase.id,
          timestamp: new Date().toISOString(),
          stage: 'ESCALATE',
          actor: 'GUARDRAIL_MONITOR',
          details: `Autonomous retry limits exhausted. Workflow escalated to prevent customer annoyance.`,
        };
        recCase.auditLogs.push(auditMax);
      } else {
        recCase.status = 'STOPPED_MAX_RETRIES';
        recCase.currentStep = 'COMPLETED';
        recCase.lastInterventionResult = 'Intervention attempt timed out. Queued for scheduled cooldown retry.';
      }

      store.saveCase(recCase);
      return {
        success: false,
        case: recCase,
        recovered: false,
        escalated: recCase.status === 'ESCALATED',
        stopped: true,
        reason: recCase.lastInterventionResult || 'Recovery attempt failed'
      };
    }
  }
}
