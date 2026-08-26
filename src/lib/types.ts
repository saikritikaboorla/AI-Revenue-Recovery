export type RecoveryStatus = 
  | 'DETECTED'
  | 'DIAGNOSING'
  | 'DECIDED'
  | 'ACTION_IN_PROGRESS'
  | 'VERIFYING'
  | 'RECOVERED'
  | 'ESCALATED'
  | 'STOPPED_MAX_RETRIES'
  | 'STOPPED_UNRECOVERABLE'
  | 'STOPPED_CUSTOMER_REQUEST';

export type LossCategory = 
  | 'PAYMENT_FAILURE'
  | 'CHECKOUT_ABANDONMENT'
  | 'FAILED_SUBSCRIPTION'
  | 'MANDATE_RETRY'
  | 'B2B_OVERDUE_RECEIVABLE';

export type FailureReasonCode = 
  | 'INSUFFICIENT_FUNDS'
  | 'BANK_DOWNTIME'
  | 'AUTH_FAILED_OTP_TIMEOUT'
  | 'CARD_EXPIRED'
  | 'MANDATE_LIMIT_EXCEEDED'
  | 'NETWORK_DECLINE'
  | 'CUSTOMER_DROPOFF_AT_PAYMENT_PAGE'
  | 'INVOICE_OVERDUE_NET30'
  | 'RISK_SCORE_ELEVATED';

export type InterventionType = 
  | 'SMART_RETRY_DOWNTIME_OPTIMAL'
  | 'SWITCH_GATEWAY_RAZORPAYX'
  | 'DYNAMIC_WHATSAPP_CHECKOUT_LINK'
  | 'SMS_FALLBACK_PAYMENT_URL'
  | 'AI_VOICE_IVR_AUTHORIZATION'
  | 'MANDATE_BATCH_RESCHEDULE'
  | 'B2B_STRUCTURED_DISCOUNT_PROMISE'
  | 'HUMAN_OPS_ESCALATION';

export interface Customer {
  id: string;
  name: string;
  email: string;
  phone: string;
  segment: 'ENTERPRISE' | 'SMB' | 'D2C_RETAIL' | 'HIGH_LTV_VIP';
  lifetimeValue: number;
  pastRecoverySuccessRate: number;
  contactPreference: 'WHATSAPP' | 'SMS' | 'EMAIL' | 'DIRECT_CALL';
  riskScore: number;
}

export interface Transaction {
  id: string;
  customerId: string;
  customerName: string;
  customerEmail: string;
  amount: number;
  currency: string;
  category: LossCategory;
  failureReason: FailureReasonCode;
  failureReasonText: string;
  createdAt: string;
  razorpayPaymentId?: string;
  razorpayOrderId?: string;
  gatewayErrorCode?: string;
  cardNetwork?: string;
  bankName?: string;
}

export interface DecisionFactor {
  factor: string;
  impact: 'POSITIVE' | 'NEUTRAL' | 'NEGATIVE';
  weight: number;
  description: string;
}

export interface AgentDecision {
  id: string;
  caseId: string;
  timestamp: string;
  diagnosis: string;
  lossProbability: number;
  recoveryConfidence: number;
  selectedIntervention: InterventionType;
  rationale: string;
  factors: DecisionFactor[];
  guardrailsChecked: {
    maxRetriesUnderLimit: boolean;
    cooldownPeriodObserved: boolean;
    customerContactLimitRespected: boolean;
    financialRiskApproved: boolean;
  };
}

export interface InterventionExecution {
  id: string;
  caseId: string;
  type: InterventionType;
  channel: string;
  initiatedAt: string;
  completedAt?: string;
  status: 'PENDING' | 'SUCCESS' | 'FAILED' | 'RETRY_SCHEDULED';
  details: Record<string, any>;
  verificationMethod: string;
  latencyMs?: number;
}

export interface AuditEvent {
  id: string;
  caseId: string;
  timestamp: string;
  stage: 'DETECT' | 'DIAGNOSE' | 'DECIDE' | 'ACT' | 'VERIFY' | 'STOP' | 'ESCALATE';
  action?: string;
  actor: 'RECOVER_AI_AUTONOMOUS_AGENT' | 'HUMAN_OFFICER' | 'GUARDRAIL_MONITOR' | 'RAZORPAY_WEBHOOK';
  details: string;
  metadata?: Record<string, any>;
}

export interface RecoveryCase {
  id: string;
  transactionId: string;
  customer: Customer;
  transaction: Transaction;
  amount: number;
  currency: string;
  category: LossCategory;
  status: RecoveryStatus;
  detectedAt: string;
  updatedAt: string;
  recoveryConfidence: number;
  recoveredAmount?: number;
  currentStep: 'DETECTED' | 'DIAGNOSING' | 'DECIDING' | 'ACTING' | 'VERIFYING' | 'COMPLETED' | 'ESCALATED';
  retryCount: number;
  maxRetriesAllowed: number;
  lastInterventionType?: InterventionType;
  lastInterventionResult?: string;
  decisions: AgentDecision[];
  interventions: InterventionExecution[];
  auditLogs: AuditEvent[];
  escalationReason?: string;
  escalatedTo?: string;
  promiseToPayDate?: string;
  recoveredAt?: string;
}

export interface GuardrailSettings {
  maxAutoRetries: number;
  cooldownMinutes: number;
  minConfidenceForAutonomousAction: number;
  maxInterventionAmountWithoutHumanReview: number;
  customerContactDailyLimit: number;
  enableVoiceAiForEnterpriseOnly: boolean;
  downtimeAutoSwitchGateway: boolean;
  b2bDiscountThresholdMaxPct: number;
}

export interface RecoveryMetrics {
  totalRevenueAtRisk: number;
  totalRecoverableRevenue: number;
  totalRevenueRecovered: number;
  overallRecoveryRate: number;
  activeWorkflowsCount: number;
  resolvedCasesCount: number;
  escalatedCasesCount: number;
  totalInterventionsRun: number;
  successfulInterventionsCount: number;
  averageRecoveryTimeSeconds: number;
  categoryBreakdown: {
    category: LossCategory;
    atRisk: number;
    recovered: number;
    recoveryRate: number;
  }[];
  interventionPerformance: {
    type: InterventionType;
    count: number;
    successRate: number;
    recoveredAmount: number;
  }[];
  recentRecoveryEvents: {
    id: string;
    customerName: string;
    amount: number;
    intervention: string;
    timestamp: string;
  }[];
}
