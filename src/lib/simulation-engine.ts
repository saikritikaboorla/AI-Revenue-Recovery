import { db, RecoveryCaseRecord, AuditRecord, RecoveryLedgerRecord, EscalationRecord } from './db';
import { PlaybookType, PLAYBOOK_CONFIGS } from './playbooks';
import { RecoveryPipeline } from './playbooks/engine';

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
  predictedRecoverableValue: number;
  verifiedRecoveredValue: number;
  stoppedCount: number;
  decisionDistribution: Record<string, number>;
  decisionFactors: Record<string, number>;
  recoveryRatePct: number;
  averageExecutionLatencyMs: number;
  /** Number of cases where a real Gemini AI call succeeded */
  aiAssistedCount: number;
  /** Number of cases where the deterministic fallback was used */
  fallbackCount: number;
  cases: Array<{
    id: string;
    customerName: string;
    amount: number;
    playbook: PlaybookType;
    status: string;
    recovered: boolean;
    escalated: boolean;
    recoveredAmount: number;
    predictedRecoverable: number;
  }>;
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
  failureReasons?: Array<{ code: string; display: string }>;
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
    failureReasons: [
      { code: 'AUTH_FAILED_OTP_TIMEOUT', display: '3D Secure 2.0 OTP authorization timeout on mobile UPI intent flow' },
      { code: 'CUSTOMER_DROPOFF_AT_PAYMENT_PAGE', display: 'Customer dropped off at payment page before authorization' },
      { code: 'INSUFFICIENT_FUNDS', display: 'Debit failed because of low balance at the settlement moment' },
    ],
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

// ---------------------------------------------------------------------------
// Case generation
// ---------------------------------------------------------------------------

function generateCase(template?: ScenarioTemplate): RecoveryCaseRecord {
  const tpl = template ?? pick(SCENARIO_TEMPLATES);
  const customer = pick(SYNTHETIC_CUSTOMERS);
  const amount = randInt(tpl.amountRange[0], tpl.amountRange[1]);
  const riskScore = randInt(tpl.baseRiskScore[0], tpl.baseRiskScore[1]);
  const now = new Date().toISOString();
  const failureVariant = tpl.failureReasons?.[Math.abs((amount + riskScore) % tpl.failureReasons.length)] ?? {
    code: tpl.failureReason,
    display: tpl.failureReasonDisplay,
  };

  // Generate a unique case ID
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
    failure_reason: failureVariant.code,
    status: 'DETECTED',
    current_step: 'DETECTED',
    recovery_confidence: Math.max(40, 100 - riskScore),
    recovered_amount: 0,
    retry_count: 0,
    max_retries: PLAYBOOK_CONFIGS[tpl.playbook].maxRetries,
    requires_human_approval: false,
    diagnosis_summary: `Auto-generated simulation case. Root cause: ${failureVariant.display}. Risk score: ${riskScore}/100.`,
    rationale: `Playbook [${PLAYBOOK_CONFIGS[tpl.playbook].displayName}] selected by simulation engine.`,
    created_at: now,
    updated_at: now,
  };

  db.saveCase(record);

  // Add initial detection audit log
  db.addAudit({
    id: `aud_${record.id}_det_${Date.now()}`,
    case_id: record.id,
    timestamp: now,
    stage: 'DETECT',
    actor: 'RECOVER_AI_ENGINE',
    action: 'REVENUE_AT_RISK_DETECTED',
    result: 'DETECTED',
    details: `Detected revenue at risk: ₹${amount.toLocaleString('en-IN')} for ${customer.name} (${customer.segment}). Failure: ${failureVariant.code}`,
  });

  return record;
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
   * Run a full batch simulation using the single RecoveryPipeline source of truth.
   *
   * Supports batchSize 1–100.
   * Each case is generated synthetically and run through the real
   * RecoveryPipeline.processCase(caseId).
   */
  public static async runBatchSimulation(config: BatchSimulationConfig): Promise<BatchSimulationResult> {
    const count = Math.min(Math.max(config.batchSize || 5, 1), 100);
    const batchId = `BATCH-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 5).toUpperCase()}`;

    // Generate all cases upfront
    const generatedCases: RecoveryCaseRecord[] = [];
    for (let i = 0; i < count; i++) {
      generatedCases.push(generateCase());
    }

    // Run real pipeline for each case and collect metrics
    let totalValueAtRisk   = 0;
    let totalValueRecovered = 0;
    let recoveredCount     = 0;
    let escalatedCount     = 0;
    let failedCount        = 0;
    let predictedRecoverableValue = 0;
    let stoppedCount = 0;
    let aiAssistedCount = 0;
    let fallbackCount = 0;
    const decisionDistribution: Record<string, number> = {};
    const decisionFactors: Record<string, number> = {};
    const caseResults: BatchSimulationResult['cases'] = [];
    let totalExecutionMs = 0;
    let executedCaseCount = 0;

    for (const recCase of generatedCases) {
      totalValueAtRisk += recCase.amount;
      predictedRecoverableValue += Math.round(recCase.amount * recCase.recovery_confidence / 100);

      if (config.autonomousAutoExecute !== false) {
        const caseStartMs = performance.now();
        const res = await RecoveryPipeline.processCase(recCase.id);
        totalExecutionMs += performance.now() - caseStartMs;
        executedCaseCount += 1;

        if (res.recovered) {
          const recAmt = res.case.recovered_amount || recCase.amount;
          totalValueRecovered += recAmt;
          recoveredCount      += 1;
        } else if (res.escalated) {
          escalatedCount += 1;
        } else if (res.case.status === 'STOPPED_UNRECOVERABLE') {
          failedCount += 1;
        }
        if (res.stopped && !res.recovered && !res.escalated) stoppedCount += 1;
        const decision = res.case.ai_decision;
        if (decision) {
          decisionDistribution[decision.selectedPlaybook] = (decisionDistribution[decision.selectedPlaybook] || 0) + 1;
          decision.decisionFactors.forEach(factor => {
            if (factor.signal === 'POSITIVE') decisionFactors[factor.factor] = (decisionFactors[factor.factor] || 0) + 1;
          });
          // Track AI-assisted vs deterministic fallback
          if (decision.source === 'GEMINI_AI' && !decision.aiFallbackUsed) {
            aiAssistedCount += 1;
          } else {
            fallbackCount += 1;
          }
        } else {
          fallbackCount += 1;
        }

        caseResults.push({
          id:            res.case.id,
          customerName:  res.case.customer_name,
          amount:        res.case.amount,
          playbook:      res.case.playbook,
          status:        res.case.status,
          recovered:     res.recovered,
          escalated:     res.escalated,
          recoveredAmount: res.case.recovered_amount || 0,
          predictedRecoverable: Math.round(recCase.amount * recCase.recovery_confidence / 100),
        });
      } else {
        caseResults.push({
          id:           recCase.id,
          customerName: recCase.customer_name,
          amount:       recCase.amount,
          playbook:     recCase.playbook,
          status:       recCase.status,
          recovered:    false,
          escalated:    false,
          recoveredAmount: 0,
          predictedRecoverable: Math.round(recCase.amount * recCase.recovery_confidence / 100),
        });
      }
    }

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
      predictedRecoverableValue,
      verifiedRecoveredValue: totalValueRecovered,
      stoppedCount,
      decisionDistribution,
      decisionFactors,
      recoveryRatePct,
      averageExecutionLatencyMs: executedCaseCount > 0
        // Keep the value honest (measured from before processCase through its
        // provider/ledger result) while avoiding a misleading rounded zero.
        ? Number(Math.max(0.01, totalExecutionMs / executedCaseCount).toFixed(2))
        : 0,
      aiAssistedCount,
      fallbackCount,
      cases: caseResults,
    };
  }
}
