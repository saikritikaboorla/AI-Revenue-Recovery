/**
 * Simulation Engine — Upgraded to support batch sizes of 1–100
 *
 * Uses the DatabaseService (db) from @/lib/db for all persistence.
 * Generates synthetic revenue-loss cases, runs them through the
 * RecoveryPipeline, and returns a BatchSimulationResult.
 */

import { db, RecoveryCaseRecord, AuditRecord, RecoveryLedgerRecord, EscalationRecord } from './db';
import { PlaybookType, PLAYBOOK_CONFIGS } from './playbooks';

// ---------------------------------------------------------------------------
// Public interfaces
// ---------------------------------------------------------------------------

export interface BatchSimulationConfig {
  /** Number of cases to generate. Supported values: 1–100. */
  batchSize: number;
  scenarioDistribution?: Partial<Record<PlaybookType, number>>;
  /** When false, only case records are generated without pipeline execution. Default: true. */
  autonomousAutoExecute?: boolean;
}

export interface BatchSimulationResult {
  batchId: string;
  totalCases: number;
  recoveredCount: number;
  escalatedCount: number;
  failedCount: number;
  totalValueAtRisk: number;
  totalValueRecovered: number;
  recoveryRatePct: number;
  averageExecutionLatencyMs: number;
  cases: any[];
}

// ---------------------------------------------------------------------------
// Scenario templates — one per PlaybookType
// ---------------------------------------------------------------------------

interface ScenarioTemplate {
  playbook: PlaybookType;
  failureReason: string;
  failureReasonDisplay: string;
  amountRange: [number, number];
  baseRiskScore: [number, number];
}

const SCENARIO_TEMPLATES: ScenarioTemplate[] = [
  {
    playbook: 'PAYMENT_DEGRADATION',
    failureReason: 'BANK_DOWNTIME',
    failureReasonDisplay: 'Intermittent downtime on issuing bank payment gateway switch',
    amountRange: [2499, 45000],
    baseRiskScore: [5, 40],
  },
  {
    playbook: 'CHECKOUT_ABANDONMENT',
    failureReason: 'CUSTOMER_DROPOFF_AT_PAYMENT_PAGE',
    failureReasonDisplay: 'Customer dropped out on payment method select screen',
    amountRange: [1499, 28000],
    baseRiskScore: [10, 55],
  },
  {
    playbook: 'FAILED_SUBSCRIPTION',
    failureReason: 'MANDATE_LIMIT_EXCEEDED',
    failureReasonDisplay: 'RBI e-mandate limit breached (recurring amount > ₹15,000 threshold)',
    amountRange: [18000, 95000],
    baseRiskScore: [15, 65],
  },
  {
    playbook: 'MANDATE_RETRY',
    failureReason: 'INSUFFICIENT_FUNDS',
    failureReasonDisplay: 'Salary credit timing mismatch on monthly recurring mandate auto-debit',
    amountRange: [2500, 15000],
    baseRiskScore: [10, 50],
  },
  {
    playbook: 'B2B_OVERDUE_RECEIVABLES',
    failureReason: 'INVOICE_OVERDUE_NET30',
    failureReasonDisplay: 'Corporate Net-30 invoice uncollected 15+ days past invoice maturity',
    amountRange: [45000, 350000],
    baseRiskScore: [20, 70],
  },
  {
    playbook: 'HINGLISH_RECOVERY',
    failureReason: 'AUTH_FAILED_OTP_TIMEOUT',
    failureReasonDisplay: '3D Secure 2.0 OTP authorization timeout on mobile UPI intent flow',
    amountRange: [499, 12000],
    baseRiskScore: [5, 45],
  },
  {
    playbook: 'PROMISE_TO_PAY',
    failureReason: 'INVOICE_OVERDUE_NET30',
    failureReasonDisplay: 'Customer verbal commitment to settle outstanding balance via P2P milestone',
    amountRange: [10000, 180000],
    baseRiskScore: [30, 75],
  },
];

// A pool of synthetic customer profiles to pick from when generating cases
const SYNTHETIC_CUSTOMERS = [
  { id: 'cust_sim_01', name: 'Aakash Verma',      email: 'aakash.v@nexusretail.in',    segment: 'HIGH_LTV_VIP' as const },
  { id: 'cust_sim_02', name: 'Priya Sundaram',     email: 'priya.s@fintechscale.io',   segment: 'ENTERPRISE' as const   },
  { id: 'cust_sim_03', name: 'Rohan Deshmukh',     email: 'rohan.d@urbanthreads.co',   segment: 'D2C_RETAIL' as const   },
  { id: 'cust_sim_04', name: 'Sunita Mehra',       email: 'sunita.m@zenithlogistics.com', segment: 'SMB' as const       },
  { id: 'cust_sim_05', name: 'Vikramaditya Rao',   email: 'v.rao@cloudcore.tech',      segment: 'ENTERPRISE' as const   },
  { id: 'cust_sim_06', name: 'Ananya Sen',         email: 'ananya.sen@glowskincare.in',segment: 'D2C_RETAIL' as const   },
  { id: 'cust_sim_07', name: 'Rahul Khanna',       email: 'rk@krishnatextiles.com',    segment: 'SMB' as const          },
  { id: 'cust_sim_08', name: 'Deepa Nair',         email: 'deepa.n@medivitals.io',     segment: 'ENTERPRISE' as const   },
  { id: 'cust_sim_09', name: 'Mohan Iyer',         email: 'm.iyer@southspicefoods.in', segment: 'D2C_RETAIL' as const   },
  { id: 'cust_sim_10', name: 'Kavitha Pillai',     email: 'k.pillai@elitefinserv.com', segment: 'HIGH_LTV_VIP' as const },
];

// ---------------------------------------------------------------------------
// Helper utilities
// ---------------------------------------------------------------------------

function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * Derive a PlaybookType deterministically from a failure reason string
 * so that pre-existing cases loaded via CSV get sensible playbook mappings.
 */
function playbookFromFailureReason(reason: string): PlaybookType {
  if (reason.includes('BANK') || reason.includes('GATEWAY')) return 'PAYMENT_DEGRADATION';
  if (reason.includes('DROPOFF') || reason.includes('ABANDONMENT')) return 'CHECKOUT_ABANDONMENT';
  if (reason.includes('MANDATE') || reason.includes('SUBSCRIPTION')) return 'FAILED_SUBSCRIPTION';
  if (reason.includes('INSUFFICIENT') || reason.includes('FUNDS')) return 'MANDATE_RETRY';
  if (reason.includes('INVOICE') || reason.includes('NET30') || reason.includes('B2B')) return 'B2B_OVERDUE_RECEIVABLES';
  if (reason.includes('OTP') || reason.includes('UPI') || reason.includes('AUTH')) return 'HINGLISH_RECOVERY';
  return 'PROMISE_TO_PAY';
}

// ---------------------------------------------------------------------------
// Case generation
// ---------------------------------------------------------------------------

function generateCase(template?: ScenarioTemplate): RecoveryCaseRecord {
  const tpl = template ?? pick(SCENARIO_TEMPLATES);
  const customer = pick(SYNTHETIC_CUSTOMERS);
  const amount = randInt(tpl.amountRange[0], tpl.amountRange[1]);
  const riskScore = randInt(tpl.baseRiskScore[0], tpl.baseRiskScore[1]);
  const now = new Date().toISOString();

  // Generate a sufficiently unique case ID even at high batch volumes
  const caseId = `SIM-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;

  const record: RecoveryCaseRecord = {
    id: caseId,
    customer_id: customer.id,
    customer_name: customer.name,
    customer_email: customer.email,
    customer_segment: customer.segment,
    customer_risk_score: riskScore,
    amount,
    currency: 'INR',
    playbook: tpl.playbook,
    failure_reason: tpl.failureReason,
    status: 'DETECTED',
    current_step: 'DETECTED',
    recovery_confidence: Math.max(40, 100 - riskScore),
    recovered_amount: 0,
    retry_count: 0,
    max_retries: PLAYBOOK_CONFIGS[tpl.playbook].maxRetries,
    requires_human_approval: false,
    diagnosis_summary: `Auto-generated simulation case. Root cause: ${tpl.failureReasonDisplay}. Risk score: ${riskScore}/100.`,
    rationale: `Playbook [${PLAYBOOK_CONFIGS[tpl.playbook].displayName}] selected by simulation engine.`,
    created_at: now,
    updated_at: now,
  };

  db.saveCase(record);
  return record;
}

// ---------------------------------------------------------------------------
// Inline pipeline executor (mirrors RecoveryPipeline.processCase logic
// but operates directly on RecoveryCaseRecord without the overhead of
// re-fetching from the store — safe for high-volume batch runs)
// ---------------------------------------------------------------------------

interface PipelineResult {
  recovered: boolean;
  escalated: boolean;
  recoveredAmount: number;
}

async function executePipeline(recCase: RecoveryCaseRecord): Promise<PipelineResult> {
  const guardrails = db.getGuardrails();
  const config = PLAYBOOK_CONFIGS[recCase.playbook];
  const now = new Date().toISOString();

  // DIAGNOSE
  recCase.status = 'DIAGNOSING';
  recCase.current_step = 'DIAGNOSING';

  const diagAudit: AuditRecord = {
    id: `aud_${recCase.id}_diag_${Date.now()}`,
    case_id: recCase.id,
    timestamp: now,
    stage: 'DIAGNOSE',
    actor: 'RECOVER_AI_DIAGNOSTIC_MODEL',
    action: 'DIAGNOSIS_FORMULATED',
    result: 'SUCCESS',
    details: recCase.diagnosis_summary || `Simulated diagnosis for ${recCase.playbook}`,
  };
  db.addAudit(diagAudit);

  // CHECK GUARDRAILS
  recCase.status = 'DECIDED';
  recCase.current_step = 'CHECK_GUARDRAILS';

  const retryOk   = recCase.retry_count < (config?.maxRetries ?? guardrails.maxRetries);
  const riskOk    = recCase.customer_risk_score <= guardrails.maxRiskScoreForAutonomousAction;
  const valueOk   = recCase.amount <= guardrails.highValueThreshold;
  const guardrailPassed = retryOk && riskOk && valueOk;

  if (!guardrailPassed) {
    recCase.status = 'ESCALATED';
    recCase.current_step = 'ESCALATED_HUMAN_APPROVAL';
    recCase.requires_human_approval = true;

    let reason = 'Guardrail trigger: ';
    if (!retryOk)  reason += `Max retries reached (${recCase.retry_count}/${guardrails.maxRetries}). `;
    if (!riskOk)   reason += `Risk score ${recCase.customer_risk_score} > ceiling ${guardrails.maxRiskScoreForAutonomousAction}. `;
    if (!valueOk)  reason += `Amount ₹${recCase.amount.toLocaleString('en-IN')} > high-value threshold ₹${guardrails.highValueThreshold.toLocaleString('en-IN')}. `;

    recCase.escalation_reason = reason;
    recCase.escalated_to = 'Senior FinTech Operations Manager';

    db.addAudit({
      id: `aud_${recCase.id}_esc_${Date.now()}`,
      case_id: recCase.id,
      timestamp: new Date().toISOString(),
      stage: 'CHECK_GUARDRAILS',
      actor: 'GUARDRAIL_COMPLIANCE_MONITOR',
      action: 'HUMAN_APPROVAL_TRIGGERED',
      result: 'ESCALATED',
      details: reason,
    });

    db.addEscalation({
      id: `esc_sim_${Date.now().toString().slice(-6)}_${Math.random().toString(36).slice(2, 5)}`,
      case_id: recCase.id,
      customer_name: recCase.customer_name,
      amount: recCase.amount,
      playbook: recCase.playbook,
      reason,
      risk_score: recCase.customer_risk_score,
      status: 'PENDING',
      assigned_to: 'Senior FinTech Operations Manager',
      created_at: new Date().toISOString(),
    } as EscalationRecord);

    db.saveCase(recCase);
    return { recovered: false, escalated: true, recoveredAmount: 0 };
  }

  // EXECUTE ACTION
  recCase.status = 'ACTION_IN_PROGRESS';
  recCase.current_step = 'EXECUTE_ACTION';
  recCase.retry_count += 1;

  const action = config.allowedActions[0] || 'smart_retry_payment';
  recCase.last_action = action;

  db.addAudit({
    id: `aud_${recCase.id}_act_${Date.now()}`,
    case_id: recCase.id,
    timestamp: new Date().toISOString(),
    stage: 'EXECUTE_ACTION',
    actor: 'RECOVER_AI_PLAYBOOK_RUNNER',
    action: `EXECUTED_${action.toUpperCase()}`,
    result: 'SUCCESS',
    details: `Dispatched bounded intervention [${action}] across Razorpay verified rails.`,
  });

  // VERIFY — probabilistic outcome
  const winProbability = Math.max(0.3, Math.min(0.95, (100 - recCase.customer_risk_score) / 100 + 0.15));
  const isSuccess = Math.random() < winProbability;

  if (isSuccess) {
    const recoveredAt = new Date().toISOString();
    recCase.status = 'RECOVERED';
    recCase.current_step = 'VERIFIED_STOPPED';
    recCase.recovered_amount = recCase.amount;
    recCase.recovered_at = recoveredAt;
    recCase.last_action_result = `Razorpay Webhook (payment.captured) verified: ₹${recCase.amount.toLocaleString('en-IN')} captured.`;

    const ledgerEntry: RecoveryLedgerRecord = {
      id: `ledg_sim_${Date.now().toString().slice(-6)}_${Math.random().toString(36).slice(2, 5)}`,
      case_id: recCase.id,
      customer_id: recCase.customer_id,
      amount_at_risk: recCase.amount,
      recovered_amount: recCase.recovered_amount,
      currency: recCase.currency,
      playbook: recCase.playbook,
      verification_source: 'RAZORPAY_WEBHOOK_VERIFIED',
      verified_at: recoveredAt,
      idempotency_key: `idemp_${recCase.id}_${recoveredAt.slice(0, 10)}`,
    };
    db.addLedger(ledgerEntry);

    db.addAudit({
      id: `aud_${recCase.id}_ver_${Date.now()}`,
      case_id: recCase.id,
      timestamp: recoveredAt,
      stage: 'VERIFY',
      actor: 'RAZORPAY_WEBHOOK_HANDLER',
      action: 'PAYMENT_CAPTURED_AND_VERIFIED',
      result: 'SUCCESS',
      details: `₹${recCase.amount.toLocaleString('en-IN')} captured. Ledger: ${ledgerEntry.id}`,
    });

    db.addAudit({
      id: `aud_${recCase.id}_stop_${Date.now()}`,
      case_id: recCase.id,
      timestamp: recoveredAt,
      stage: 'STOP_OR_ESCALATE',
      actor: 'RECOVER_AI_ENGINE',
      action: 'WORKFLOW_CLOSED_SUCCESSFULLY',
      result: 'SUCCESS',
      details: 'Closed-loop workflow terminated cleanly. Money recovered and accounted.',
    });

    db.saveCase(recCase);
    return { recovered: true, escalated: false, recoveredAmount: recCase.recovered_amount };
  }

  // Failure path
  if (recCase.retry_count >= guardrails.maxRetries) {
    recCase.status = 'ESCALATED';
    recCase.current_step = 'ESCALATED_MAX_RETRIES';
    recCase.escalation_reason = `Maximum retry attempts (${recCase.retry_count}/${guardrails.maxRetries}) exhausted.`;
    recCase.escalated_to = 'Commercial Operations Lead';

    db.addAudit({
      id: `aud_${recCase.id}_stop_${Date.now()}`,
      case_id: recCase.id,
      timestamp: new Date().toISOString(),
      stage: 'STOP_OR_ESCALATE',
      actor: 'GUARDRAIL_COMPLIANCE_MONITOR',
      action: 'RETRIES_EXHAUSTED_ESCALATED',
      result: 'ESCALATED',
      details: recCase.escalation_reason,
    });

    db.saveCase(recCase);
    return { recovered: false, escalated: true, recoveredAmount: 0 };
  }

  recCase.status = 'ACTION_IN_PROGRESS';
  recCase.current_step = 'COOLDOWN_SCHEDULED';
  recCase.last_action_result = 'Attempt unacknowledged. Cooldown timer set before next bounded retry.';
  db.saveCase(recCase);
  return { recovered: false, escalated: false, recoveredAmount: 0 };
}

// ---------------------------------------------------------------------------
// SimulationEngine — public API
// ---------------------------------------------------------------------------

export class SimulationEngine {
  /**
   * Generate a single synthetic RecoveryCase and persist it via db.
   * Optionally force a specific playbook type.
   */
  public static generateCase(playbookType?: PlaybookType): RecoveryCaseRecord {
    const template = playbookType
      ? SCENARIO_TEMPLATES.find(t => t.playbook === playbookType) ?? pick(SCENARIO_TEMPLATES)
      : pick(SCENARIO_TEMPLATES);
    return generateCase(template);
  }

  /**
   * Run a full batch simulation.
   *
   * Supports batchSize 1–100. No hard upper cap beyond 100.
   * Each case is generated synthetically and run through the
   * full DETECT → DIAGNOSE → DECIDE → ACT → VERIFY → STOP/ESCALATE pipeline.
   */
  public static async runBatchSimulation(config: BatchSimulationConfig): Promise<BatchSimulationResult> {
    // Clamp to 1–100 (remove old hard cap of 20/12)
    const count = Math.min(Math.max(config.batchSize || 5, 1), 100);
    const startMs = Date.now();
    const batchId = `BATCH-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 5).toUpperCase()}`;

    // Generate all cases upfront
    const generatedCases: RecoveryCaseRecord[] = [];
    for (let i = 0; i < count; i++) {
      generatedCases.push(generateCase());
    }

    // Run pipeline for each case and collect metrics
    let totalValueAtRisk   = 0;
    let totalValueRecovered = 0;
    let recoveredCount     = 0;
    let escalatedCount     = 0;
    let failedCount        = 0;
    const caseResults: any[] = [];

    for (const recCase of generatedCases) {
      totalValueAtRisk += recCase.amount;

      if (config.autonomousAutoExecute !== false) {
        const res = await executePipeline(recCase);

        if (res.recovered) {
          totalValueRecovered += res.recoveredAmount;
          recoveredCount      += 1;
        } else if (res.escalated) {
          escalatedCount += 1;
        } else {
          failedCount += 1;
        }

        caseResults.push({
          id:            recCase.id,
          customerName:  recCase.customer_name,
          amount:        recCase.amount,
          playbook:      recCase.playbook,
          status:        recCase.status,
          recovered:     res.recovered,
          escalated:     res.escalated,
          recoveredAmount: res.recoveredAmount,
        });
      } else {
        failedCount += 1;
        caseResults.push({
          id:           recCase.id,
          customerName: recCase.customer_name,
          amount:       recCase.amount,
          playbook:     recCase.playbook,
          status:       recCase.status,
          recovered:    false,
          escalated:    false,
          recoveredAmount: 0,
        });
      }
    }

    const durationMs = Date.now() - startMs;
    const recoveryRatePct = totalValueAtRisk > 0
      ? Number(((totalValueRecovered / totalValueAtRisk) * 100).toFixed(1))
      : 0;

    return {
      batchId,
      totalCases:              count,
      recoveredCount,
      escalatedCount,
      failedCount,
      totalValueAtRisk,
      totalValueRecovered,
      recoveryRatePct,
      averageExecutionLatencyMs: count > 0 ? Math.round(durationMs / count) : 0,
      cases: caseResults,
    };
  }
}
