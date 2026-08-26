import { RecoveryCase, GuardrailSettings, RecoveryMetrics, Customer, Transaction, LossCategory, FailureReasonCode, InterventionType, AgentDecision, AuditEvent } from './types';

export const defaultGuardrails: GuardrailSettings = {
  maxAutoRetries: 3,
  cooldownMinutes: 15,
  minConfidenceForAutonomousAction: 60,
  maxInterventionAmountWithoutHumanReview: 100000,
  customerContactDailyLimit: 2,
  enableVoiceAiForEnterpriseOnly: false,
  downtimeAutoSwitchGateway: true,
  b2bDiscountThresholdMaxPct: 10,
};

const seedCustomers: Customer[] = [
  {
    id: 'cust_01',
    name: 'Aakash Verma',
    email: 'aakash.v@nexusretail.in',
    phone: '+91 98230 44123',
    segment: 'HIGH_LTV_VIP',
    lifetimeValue: 485000,
    pastRecoverySuccessRate: 92,
    contactPreference: 'WHATSAPP',
    riskScore: 12,
  },
  {
    id: 'cust_02',
    name: 'Priya Sundaram',
    email: 'priya.s@fintechscale.io',
    phone: '+91 97110 55890',
    segment: 'ENTERPRISE',
    lifetimeValue: 1250000,
    pastRecoverySuccessRate: 88,
    contactPreference: 'EMAIL',
    riskScore: 18,
  },
  {
    id: 'cust_03',
    name: 'Rohan Deshmukh',
    email: 'rohan.d@urbanthreads.co',
    phone: '+91 99402 11928',
    segment: 'D2C_RETAIL',
    lifetimeValue: 34000,
    pastRecoverySuccessRate: 64,
    contactPreference: 'WHATSAPP',
    riskScore: 35,
  },
  {
    id: 'cust_04',
    name: 'Sunita Mehra',
    email: 'sunita.m@zenithlogistics.com',
    phone: '+91 98840 99211',
    segment: 'SMB',
    lifetimeValue: 180000,
    pastRecoverySuccessRate: 75,
    contactPreference: 'SMS',
    riskScore: 22,
  },
  {
    id: 'cust_05',
    name: 'Vikramaditya Rao',
    email: 'v.rao@cloudcore.tech',
    phone: '+91 96500 77124',
    segment: 'ENTERPRISE',
    lifetimeValue: 2400000,
    pastRecoverySuccessRate: 95,
    contactPreference: 'DIRECT_CALL',
    riskScore: 8,
  },
  {
    id: 'cust_06',
    name: 'Ananya Sen',
    email: 'ananya.sen@glowskincare.in',
    phone: '+91 98190 33451',
    segment: 'D2C_RETAIL',
    lifetimeValue: 18500,
    pastRecoverySuccessRate: 50,
    contactPreference: 'WHATSAPP',
    riskScore: 42,
  },
  {
    id: 'cust_07',
    name: 'Deepak Chawla',
    email: 'deepak@hyperpulse.ai',
    phone: '+91 99100 88234',
    segment: 'SMB',
    lifetimeValue: 95000,
    pastRecoverySuccessRate: 80,
    contactPreference: 'WHATSAPP',
    riskScore: 28,
  },
  {
    id: 'cust_08',
    name: 'Meera Nambiar',
    email: 'meera.n@strataarch.com',
    phone: '+91 94470 66129',
    segment: 'ENTERPRISE',
    lifetimeValue: 870000,
    pastRecoverySuccessRate: 70,
    contactPreference: 'EMAIL',
    riskScore: 68,
  }
];

export function generateSeedCases(): RecoveryCase[] {
  const now = new Date();
  
  return [
    {
      id: 'REC-9021',
      transactionId: 'pay_Hdfc883192',
      customer: seedCustomers[0],
      transaction: {
        id: 'pay_Hdfc883192',
        customerId: seedCustomers[0].id,
        customerName: seedCustomers[0].name,
        customerEmail: seedCustomers[0].email,
        amount: 24999,
        currency: 'INR',
        category: 'PAYMENT_FAILURE',
        failureReason: 'BANK_DOWNTIME',
        failureReasonText: 'HDFC Bank Netbanking node unresponsive / timeout (504)',
        createdAt: new Date(now.getTime() - 14 * 60 * 1000).toISOString(),
        gatewayErrorCode: 'GATEWAY_TIMEOUT',
        bankName: 'HDFC Bank',
      },
      amount: 24999,
      currency: 'INR',
      category: 'PAYMENT_FAILURE',
      status: 'RECOVERED',
      detectedAt: new Date(now.getTime() - 14 * 60 * 1000).toISOString(),
      updatedAt: new Date(now.getTime() - 2 * 60 * 1000).toISOString(),
      recoveryConfidence: 94,
      recoveredAmount: 24999,
      currentStep: 'COMPLETED',
      retryCount: 1,
      maxRetriesAllowed: 3,
      lastInterventionType: 'SWITCH_GATEWAY_RAZORPAYX',
      lastInterventionResult: 'Route switched to secondary UPI/Card rail. Payment confirmed.',
      recoveredAt: new Date(now.getTime() - 2 * 60 * 1000).toISOString(),
      decisions: [
        {
          id: 'dec_101',
          caseId: 'REC-9021',
          timestamp: new Date(now.getTime() - 12 * 60 * 1000).toISOString(),
          diagnosis: 'Temporary bank-side gateway outage detected on HDFC Netbanking cluster. VIP customer with 92% historical recovery rate.',
          lossProbability: 0.85,
          recoveryConfidence: 0.94,
          selectedIntervention: 'SWITCH_GATEWAY_RAZORPAYX',
          rationale: 'Rerouted through Razorpay Optimizer dynamic failover cluster. Initiated 1-click fallback session.',
          factors: [
            { factor: 'Customer LTV', impact: 'POSITIVE', weight: 0.35, description: 'VIP Segment (LTV ₹4,85,000)' },
            { factor: 'Downtime Detection', impact: 'POSITIVE', weight: 0.40, description: 'Known transient bank failure (resolving)' },
            { factor: 'Risk Score', impact: 'POSITIVE', weight: 0.25, description: 'Ultra-low risk score (12/100)' }
          ],
          guardrailsChecked: {
            maxRetriesUnderLimit: true,
            cooldownPeriodObserved: true,
            customerContactLimitRespected: true,
            financialRiskApproved: true,
          }
        }
      ],
      interventions: [
        {
          id: 'int_101',
          caseId: 'REC-9021',
          type: 'SWITCH_GATEWAY_RAZORPAYX',
          channel: 'Razorpay Optimizer API',
          initiatedAt: new Date(now.getTime() - 11 * 60 * 1000).toISOString(),
          completedAt: new Date(now.getTime() - 2 * 60 * 1000).toISOString(),
          status: 'SUCCESS',
          details: { switchTarget: 'UPI_INTENT_RAZORPAYX', autoSessionCreated: true },
          verificationMethod: 'Razorpay Webhook: payment.captured',
          latencyMs: 1420
        }
      ],
      auditLogs: [
        {
          id: 'aud_1',
          caseId: 'REC-9021',
          timestamp: new Date(now.getTime() - 14 * 60 * 1000).toISOString(),
          stage: 'DETECT',
          actor: 'RAZORPAY_WEBHOOK',
          details: 'Event payment.failed received for order_Nx7712a (Amount ₹24,999.00)',
        },
        {
          id: 'aud_2',
          caseId: 'REC-9021',
          timestamp: new Date(now.getTime() - 13 * 60 * 1000).toISOString(),
          stage: 'DIAGNOSE',
          actor: 'RECOVER_AI_AUTONOMOUS_AGENT',
          details: 'Correlated with 43 other HDFC gateway dropouts in current 15m window. LTV checked.',
        },
        {
          id: 'aud_3',
          caseId: 'REC-9021',
          timestamp: new Date(now.getTime() - 12 * 60 * 1000).toISOString(),
          stage: 'DECIDE',
          actor: 'RECOVER_AI_AUTONOMOUS_AGENT',
          details: 'Decision rule: GATEWAY_FAILOVER executed. Confidence score: 94%.',
        },
        {
          id: 'aud_4',
          caseId: 'REC-9021',
          timestamp: new Date(now.getTime() - 11 * 60 * 1000).toISOString(),
          stage: 'ACT',
          actor: 'RECOVER_AI_AUTONOMOUS_AGENT',
          details: 'Dispatched dynamic fallback session to customer client.',
        },
        {
          id: 'aud_5',
          caseId: 'REC-9021',
          timestamp: new Date(now.getTime() - 2 * 60 * 1000).toISOString(),
          stage: 'VERIFY',
          actor: 'RAZORPAY_WEBHOOK',
          details: 'Payment verified & captured: pay_Hdfc883192_rec (₹24,999.00 INR). Status: RECOVERED.',
        },
        {
          id: 'aud_6',
          caseId: 'REC-9021',
          timestamp: new Date(now.getTime() - 2 * 60 * 1000).toISOString(),
          stage: 'STOP',
          actor: 'RECOVER_AI_AUTONOMOUS_AGENT',
          details: 'Closed recovery workflow cleanly. Emitted metrics update.',
        }
      ]
    },
    {
      id: 'REC-9022',
      transactionId: 'sub_card_77491',
      customer: seedCustomers[1],
      transaction: {
        id: 'sub_card_77491',
        customerId: seedCustomers[1].id,
        customerName: seedCustomers[1].name,
        customerEmail: seedCustomers[1].email,
        amount: 85000,
        currency: 'INR',
        category: 'FAILED_SUBSCRIPTION',
        failureReason: 'MANDATE_LIMIT_EXCEEDED',
        failureReasonText: 'RBI e-Mandate threshold exceeded for auto-debit (limit ₹15,000)',
        createdAt: new Date(now.getTime() - 32 * 60 * 1000).toISOString(),
        gatewayErrorCode: 'MANDATE_LIMIT_BREACH',
      },
      amount: 85000,
      currency: 'INR',
      category: 'FAILED_SUBSCRIPTION',
      status: 'ACTION_IN_PROGRESS',
      detectedAt: new Date(now.getTime() - 32 * 60 * 1000).toISOString(),
      updatedAt: new Date(now.getTime() - 8 * 60 * 1000).toISOString(),
      recoveryConfidence: 89,
      currentStep: 'ACTING',
      retryCount: 1,
      maxRetriesAllowed: 3,
      lastInterventionType: 'DYNAMIC_WHATSAPP_CHECKOUT_LINK',
      lastInterventionResult: 'WhatsApp interactive 1-click AFA authentication sent. Customer opened message.',
      decisions: [
        {
          id: 'dec_102',
          caseId: 'REC-9022',
          timestamp: new Date(now.getTime() - 30 * 60 * 1000).toISOString(),
          diagnosis: 'Recurring B2B enterprise subscription invoice exceeded statutory auto-debit cap. Requires explicit 2FA re-authorization.',
          lossProbability: 0.70,
          recoveryConfidence: 0.89,
          selectedIntervention: 'DYNAMIC_WHATSAPP_CHECKOUT_LINK',
          rationale: 'Generated personalized authenticated payment token link with WhatsApp pre-filled receipt to avoid subscription churn.',
          factors: [
            { factor: 'Enterprise Account', impact: 'POSITIVE', weight: 0.40, description: 'High retention priority (LTV ₹12,50,000)' },
            { factor: 'Mandate Limit Rule', impact: 'NEUTRAL', weight: 0.35, description: 'Regulatory mandate limitation requires direct approval' },
            { factor: 'Channel Responsiveness', impact: 'POSITIVE', weight: 0.25, description: 'Customer reads WhatsApp within 3.5 minutes' }
          ],
          guardrailsChecked: {
            maxRetriesUnderLimit: true,
            cooldownPeriodObserved: true,
            customerContactLimitRespected: true,
            financialRiskApproved: true,
          }
        }
      ],
      interventions: [
        {
          id: 'int_102',
          caseId: 'REC-9022',
          type: 'DYNAMIC_WHATSAPP_CHECKOUT_LINK',
          channel: 'Meta WhatsApp Cloud API / Razorpay Payment Links',
          initiatedAt: new Date(now.getTime() - 25 * 60 * 1000).toISOString(),
          status: 'PENDING',
          details: { templateId: 'sub_recovery_v2', linkExpiry: '24h', shortUrl: 'https://rzp.io/i/rec8812' },
          verificationMethod: 'Webhook polling & link callback',
          latencyMs: 380
        }
      ],
      auditLogs: [
        {
          id: 'aud_21',
          caseId: 'REC-9022',
          timestamp: new Date(now.getTime() - 32 * 60 * 1000).toISOString(),
          stage: 'DETECT',
          actor: 'RAZORPAY_WEBHOOK',
          details: 'Subscription invoice charge failed: MANDATE_LIMIT_EXCEEDED on card_9921',
        },
        {
          id: 'aud_22',
          caseId: 'REC-9022',
          timestamp: new Date(now.getTime() - 30 * 60 * 1000).toISOString(),
          stage: 'DIAGNOSE',
          actor: 'RECOVER_AI_AUTONOMOUS_AGENT',
          details: 'Diagnosed regulatory requirement for additional factor authentication (AFA).',
        },
        {
          id: 'aud_23',
          caseId: 'REC-9022',
          timestamp: new Date(now.getTime() - 25 * 60 * 1000).toISOString(),
          stage: 'ACT',
          actor: 'RECOVER_AI_AUTONOMOUS_AGENT',
          details: 'Dispatched dynamic 1-click Razorpay payment link via verified WhatsApp Business API.',
        }
      ]
    },
    {
      id: 'REC-9023',
      transactionId: 'chk_abn_44012',
      customer: seedCustomers[2],
      transaction: {
        id: 'chk_abn_44012',
        customerId: seedCustomers[2].id,
        customerName: seedCustomers[2].name,
        customerEmail: seedCustomers[2].email,
        amount: 8499,
        currency: 'INR',
        category: 'CHECKOUT_ABANDONMENT',
        failureReason: 'CUSTOMER_DROPOFF_AT_PAYMENT_PAGE',
        failureReasonText: 'User dropped off on payment selector without initiating intent',
        createdAt: new Date(now.getTime() - 48 * 60 * 1000).toISOString(),
      },
      amount: 8499,
      currency: 'INR',
      category: 'CHECKOUT_ABANDONMENT',
      status: 'RECOVERED',
      detectedAt: new Date(now.getTime() - 48 * 60 * 1000).toISOString(),
      updatedAt: new Date(now.getTime() - 15 * 60 * 1000).toISOString(),
      recoveryConfidence: 78,
      recoveredAmount: 8499,
      currentStep: 'COMPLETED',
      retryCount: 1,
      maxRetriesAllowed: 2,
      lastInterventionType: 'DYNAMIC_WHATSAPP_CHECKOUT_LINK',
      lastInterventionResult: 'Cart restored with saved UPI ID. Customer completed payment on WhatsApp Webhook trigger.',
      recoveredAt: new Date(now.getTime() - 15 * 60 * 1000).toISOString(),
      decisions: [
        {
          id: 'dec_103',
          caseId: 'REC-9023',
          timestamp: new Date(now.getTime() - 40 * 60 * 1000).toISOString(),
          diagnosis: 'High-intent cart abandonment. Customer spent 4.2 minutes reviewing delivery before dropoff.',
          lossProbability: 0.90,
          recoveryConfidence: 0.78,
          selectedIntervention: 'DYNAMIC_WHATSAPP_CHECKOUT_LINK',
          rationale: 'Instant recovery message with 1-tap UPI deep-link sent before session cools off.',
          factors: [
            { factor: 'Cart Value', impact: 'POSITIVE', weight: 0.30, description: 'Above median basket size' },
            { factor: 'Time to Dropoff', impact: 'POSITIVE', weight: 0.40, description: 'Recent active session' },
            { factor: 'Channel Match', impact: 'POSITIVE', weight: 0.30, description: 'WhatsApp enabled' }
          ],
          guardrailsChecked: {
            maxRetriesUnderLimit: true,
            cooldownPeriodObserved: true,
            customerContactLimitRespected: true,
            financialRiskApproved: true,
          }
        }
      ],
      interventions: [
        {
          id: 'int_103',
          caseId: 'REC-9023',
          type: 'DYNAMIC_WHATSAPP_CHECKOUT_LINK',
          channel: 'WhatsApp QuickPay API',
          initiatedAt: new Date(now.getTime() - 35 * 60 * 1000).toISOString(),
          completedAt: new Date(now.getTime() - 15 * 60 * 1000).toISOString(),
          status: 'SUCCESS',
          details: { cartToken: 'c_88491', discountApplied: '0%' },
          verificationMethod: 'Razorpay Order Paid Event',
          latencyMs: 910
        }
      ],
      auditLogs: [
        {
          id: 'aud_31',
          caseId: 'REC-9023',
          timestamp: new Date(now.getTime() - 48 * 60 * 1000).toISOString(),
          stage: 'DETECT',
          actor: 'RECOVER_AI_AUTONOMOUS_AGENT',
          details: 'Checkout session expired without transaction trigger. Added to queue.',
        },
        {
          id: 'aud_32',
          caseId: 'REC-9023',
          timestamp: new Date(now.getTime() - 35 * 60 * 1000).toISOString(),
          stage: 'ACT',
          actor: 'RECOVER_AI_AUTONOMOUS_AGENT',
          details: 'Dispatched dynamic cart recovery message with instant payment intent.',
        },
        {
          id: 'aud_33',
          caseId: 'REC-9023',
          timestamp: new Date(now.getTime() - 15 * 60 * 1000).toISOString(),
          stage: 'VERIFY',
          actor: 'RAZORPAY_WEBHOOK',
          details: 'Order captured: order_kL88319 (Amount ₹8,499.00). Marked RECOVERED.',
        }
      ]
    },
    {
      id: 'REC-9024',
      transactionId: 'inv_b2b_99182',
      customer: seedCustomers[7],
      transaction: {
        id: 'inv_b2b_99182',
        customerId: seedCustomers[7].id,
        customerName: seedCustomers[7].name,
        customerEmail: seedCustomers[7].email,
        amount: 320000,
        currency: 'INR',
        category: 'B2B_OVERDUE_RECEIVABLE',
        failureReason: 'INVOICE_OVERDUE_NET30',
        failureReasonText: 'Net-30 invoice term exceeded by 18 days. Payment uncollected.',
        createdAt: new Date(now.getTime() - 18 * 24 * 60 * 60 * 1000).toISOString(),
      },
      amount: 320000,
      currency: 'INR',
      category: 'B2B_OVERDUE_RECEIVABLE',
      status: 'ESCALATED',
      detectedAt: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString(),
      updatedAt: new Date(now.getTime() - 3 * 60 * 1000).toISOString(),
      recoveryConfidence: 45,
      currentStep: 'ESCALATED',
      retryCount: 3,
      maxRetriesAllowed: 3,
      lastInterventionType: 'HUMAN_OPS_ESCALATION',
      lastInterventionResult: 'Max autonomous contact attempts reached. Escalated to Senior Finance Relationship Manager.',
      escalationReason: 'Exceeded autonomous outreach limit (3 attempts) on high-value invoice (> ₹1,00,000). Client risk score elevated.',
      escalatedTo: 'Varun Khanna (Head of B2B Receivables)',
      decisions: [
        {
          id: 'dec_104',
          caseId: 'REC-9024',
          timestamp: new Date(now.getTime() - 4 * 60 * 1000).toISOString(),
          diagnosis: 'Customer has not responded to automated payment reminders or 5% early settlement offer. High credit risk indicators.',
          lossProbability: 0.65,
          recoveryConfidence: 0.45,
          selectedIntervention: 'HUMAN_OPS_ESCALATION',
          rationale: 'Guardrail trigger: Auto-retry threshold exhausted. Mandated direct relationship outreach.',
          factors: [
            { factor: 'Invoice Size', impact: 'NEGATIVE', weight: 0.50, description: '₹3,20,000 invoice exceeds single-agent risk ceiling' },
            { factor: 'Customer Risk Score', impact: 'NEGATIVE', weight: 0.35, description: 'Elevated credit risk score (68/100)' },
            { factor: 'Contact Frequency', impact: 'NEGATIVE', weight: 0.15, description: 'Daily outreach limit reached' }
          ],
          guardrailsChecked: {
            maxRetriesUnderLimit: false,
            cooldownPeriodObserved: true,
            customerContactLimitRespected: true,
            financialRiskApproved: false,
          }
        }
      ],
      interventions: [
        {
          id: 'int_104',
          caseId: 'REC-9024',
          type: 'B2B_STRUCTURED_DISCOUNT_PROMISE',
          channel: 'Email + Invoicing Portal',
          initiatedAt: new Date(now.getTime() - 24 * 60 * 1000).toISOString(),
          status: 'FAILED',
          details: { offerTerms: '5% instant cash settlement before EOD' },
          verificationMethod: 'Razorpay Invoices API',
          latencyMs: 650
        },
        {
          id: 'int_105',
          caseId: 'REC-9024',
          type: 'HUMAN_OPS_ESCALATION',
          channel: 'Internal Ops Ticket #FIN-8821',
          initiatedAt: new Date(now.getTime() - 3 * 60 * 1000).toISOString(),
          status: 'SUCCESS',
          details: { assignee: 'Varun Khanna', priority: 'URGENT' },
          verificationMethod: 'Ops Ticket Assigned',
          latencyMs: 120
        }
      ],
      auditLogs: [
        {
          id: 'aud_41',
          caseId: 'REC-9024',
          timestamp: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString(),
          stage: 'DETECT',
          actor: 'RECOVER_AI_AUTONOMOUS_AGENT',
          details: 'Overdue receivable identified. Invoice inv_b2b_99182 past Net-30 maturity.',
        },
        {
          id: 'aud_42',
          caseId: 'REC-9024',
          timestamp: new Date(now.getTime() - 4 * 60 * 1000).toISOString(),
          stage: 'DECIDE',
          actor: 'GUARDRAIL_MONITOR',
          details: 'Guardrail breach: Max retry attempts reached (3/3). Auto-intervention blocked.',
        },
        {
          id: 'aud_43',
          caseId: 'REC-9024',
          timestamp: new Date(now.getTime() - 3 * 60 * 1000).toISOString(),
          stage: 'ESCALATE',
          actor: 'RECOVER_AI_AUTONOMOUS_AGENT',
          details: 'Escalated to Human Ops (Assignee: Varun Khanna) with complete context package.',
        }
      ]
    },
    {
      id: 'REC-9025',
      transactionId: 'mand_icici_1092',
      customer: seedCustomers[3],
      transaction: {
        id: 'mand_icici_1092',
        customerId: seedCustomers[3].id,
        customerName: seedCustomers[3].name,
        customerEmail: seedCustomers[3].email,
        amount: 4500,
        currency: 'INR',
        category: 'MANDATE_RETRY',
        failureReason: 'INSUFFICIENT_FUNDS',
        failureReasonText: 'Salary cycle mismatch. Account balance below debit debit amount.',
        createdAt: new Date(now.getTime() - 60 * 60 * 1000).toISOString(),
      },
      amount: 4500,
      currency: 'INR',
      category: 'MANDATE_RETRY',
      status: 'RECOVERED',
      detectedAt: new Date(now.getTime() - 60 * 60 * 1000).toISOString(),
      updatedAt: new Date(now.getTime() - 5 * 60 * 1000).toISOString(),
      recoveryConfidence: 86,
      recoveredAmount: 4500,
      currentStep: 'COMPLETED',
      retryCount: 1,
      maxRetriesAllowed: 3,
      lastInterventionType: 'SMART_RETRY_DOWNTIME_OPTIMAL',
      lastInterventionResult: 'Smart debit rescheduling aligned with salary credit window. Auto-debit succeeded.',
      recoveredAt: new Date(now.getTime() - 5 * 60 * 1000).toISOString(),
      decisions: [
        {
          id: 'dec_105',
          caseId: 'REC-9025',
          timestamp: new Date(now.getTime() - 50 * 60 * 1000).toISOString(),
          diagnosis: 'End of month salary liquidity timing mismatch. Customer has 100% past settlement record.',
          lossProbability: 0.35,
          recoveryConfidence: 0.86,
          selectedIntervention: 'SMART_RETRY_DOWNTIME_OPTIMAL',
          rationale: 'Scheduled debit for optimal inter-bank clearing window (06:00 AM IST) rather than immediate aggressive re-attempt.',
          factors: [
            { factor: 'Customer Reliability', impact: 'POSITIVE', weight: 0.50, description: 'Zero historical defaults' },
            { factor: 'Transaction Size', impact: 'POSITIVE', weight: 0.30, description: 'Manageable consumer debit size' }
          ],
          guardrailsChecked: {
            maxRetriesUnderLimit: true,
            cooldownPeriodObserved: true,
            customerContactLimitRespected: true,
            financialRiskApproved: true,
          }
        }
      ],
      interventions: [
        {
          id: 'int_106',
          caseId: 'REC-9025',
          type: 'SMART_RETRY_DOWNTIME_OPTIMAL',
          channel: 'Razorpay Subscriptions / e-NACH Queue',
          initiatedAt: new Date(now.getTime() - 40 * 60 * 1000).toISOString(),
          completedAt: new Date(now.getTime() - 5 * 60 * 1000).toISOString(),
          status: 'SUCCESS',
          details: { scheduledBatch: 'MORNING_SETTLEMENT_01' },
          verificationMethod: 'NACH Settlement Webhook',
          latencyMs: 510
        }
      ],
      auditLogs: [
        {
          id: 'aud_51',
          caseId: 'REC-9025',
          timestamp: new Date(now.getTime() - 60 * 60 * 1000).toISOString(),
          stage: 'DETECT',
          actor: 'RAZORPAY_WEBHOOK',
          details: 'Mandate debit failed with INSUFFICIENT_FUNDS code.',
        },
        {
          id: 'aud_52',
          caseId: 'REC-9025',
          timestamp: new Date(now.getTime() - 50 * 60 * 1000).toISOString(),
          stage: 'DECIDE',
          actor: 'RECOVER_AI_AUTONOMOUS_AGENT',
          details: 'Calculated optimal batch retry schedule. Avoided spamming customer.',
        },
        {
          id: 'aud_53',
          caseId: 'REC-9025',
          timestamp: new Date(now.getTime() - 5 * 60 * 1000).toISOString(),
          stage: 'VERIFY',
          actor: 'RAZORPAY_WEBHOOK',
          details: 'Mandate execution succeeded: ₹4,500.00 recovered.',
        }
      ]
    },
    {
      id: 'REC-9026',
      transactionId: 'pay_Axis_449102',
      customer: seedCustomers[4],
      transaction: {
        id: 'pay_Axis_449102',
        customerId: seedCustomers[4].id,
        customerName: seedCustomers[4].name,
        customerEmail: seedCustomers[4].email,
        amount: 145000,
        currency: 'INR',
        category: 'PAYMENT_FAILURE',
        failureReason: 'AUTH_FAILED_OTP_TIMEOUT',
        failureReasonText: '3D Secure OTP verification expired during corporate card checkout',
        createdAt: new Date(now.getTime() - 10 * 60 * 1000).toISOString(),
        bankName: 'Axis Bank Commercial',
      },
      amount: 145000,
      currency: 'INR',
      category: 'PAYMENT_FAILURE',
      status: 'ACTION_IN_PROGRESS',
      detectedAt: new Date(now.getTime() - 10 * 60 * 1000).toISOString(),
      updatedAt: new Date(now.getTime() - 2 * 60 * 1000).toISOString(),
      recoveryConfidence: 91,
      currentStep: 'ACTING',
      retryCount: 1,
      maxRetriesAllowed: 3,
      lastInterventionType: 'AI_VOICE_IVR_AUTHORIZATION',
      lastInterventionResult: 'AI conversational voice bridge dispatched to CFO authorized contact.',
      decisions: [
        {
          id: 'dec_106',
          caseId: 'REC-9026',
          timestamp: new Date(now.getTime() - 8 * 60 * 1000).toISOString(),
          diagnosis: 'High-value enterprise checkout interrupted by SMS OTP latency. Customer still on workstation.',
          lossProbability: 0.75,
          recoveryConfidence: 0.91,
          selectedIntervention: 'AI_VOICE_IVR_AUTHORIZATION',
          rationale: 'VIP customer account requires priority handling. Automated interactive voice bridge initiated for immediate 1-tap re-auth.',
          factors: [
            { factor: 'High LTV VIP Account', impact: 'POSITIVE', weight: 0.50, description: 'LTV ₹24,00,000 Tier-1 Enterprise' },
            { factor: 'Failure Specificity', impact: 'POSITIVE', weight: 0.30, description: 'OTP timeout, no fund deficiency' }
          ],
          guardrailsChecked: {
            maxRetriesUnderLimit: true,
            cooldownPeriodObserved: true,
            customerContactLimitRespected: true,
            financialRiskApproved: true,
          }
        }
      ],
      interventions: [
        {
          id: 'int_107',
          caseId: 'REC-9026',
          type: 'AI_VOICE_IVR_AUTHORIZATION',
          channel: 'AI Voice Bridge / Telephony Gateway',
          initiatedAt: new Date(now.getTime() - 5 * 60 * 1000).toISOString(),
          status: 'PENDING',
          details: { voiceSessionId: 'call_9918a', agentModel: 'RecoverAI Enterprise Voice' },
          verificationMethod: 'Direct Payment Re-authorization',
          latencyMs: 780
        }
      ],
      auditLogs: [
        {
          id: 'aud_61',
          caseId: 'REC-9026',
          timestamp: new Date(now.getTime() - 10 * 60 * 1000).toISOString(),
          stage: 'DETECT',
          actor: 'RAZORPAY_WEBHOOK',
          details: 'Payment failure detected: OTP timeout on corporate credit card.',
        },
        {
          id: 'aud_62',
          caseId: 'REC-9026',
          timestamp: new Date(now.getTime() - 8 * 60 * 1000).toISOString(),
          stage: 'DECIDE',
          actor: 'RECOVER_AI_AUTONOMOUS_AGENT',
          details: 'High-priority VIP Voice Bridge triggered based on customer tier.',
        }
      ]
    }
  ];
}

class RecoverAIStore {
  private static instance: RecoverAIStore;
  private cases: Map<string, RecoveryCase> = new Map();
  private customers: Map<string, Customer> = new Map();
  private guardrails: GuardrailSettings = { ...defaultGuardrails };
  private initialized: boolean = false;

  private constructor() {
    this.init();
  }

  public static getInstance(): RecoverAIStore {
    if (!RecoverAIStore.instance) {
      RecoverAIStore.instance = new RecoverAIStore();
    }
    return RecoverAIStore.instance;
  }

  private init() {
    if (this.initialized) return;
    seedCustomers.forEach(c => this.customers.set(c.id, c));
    const initialCases = generateSeedCases();
    initialCases.forEach(c => this.cases.set(c.id, c));
    this.initialized = true;
  }

  public getAllCases(): RecoveryCase[] {
    return Array.from(this.cases.values()).sort((a, b) => 
      new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );
  }

  public getCaseById(id: string): RecoveryCase | undefined {
    return this.cases.get(id);
  }

  public saveCase(recCase: RecoveryCase): RecoveryCase {
    recCase.updatedAt = new Date().toISOString();
    this.cases.set(recCase.id, recCase);
    return recCase;
  }

  public getGuardrails(): GuardrailSettings {
    return this.guardrails;
  }

  public updateGuardrails(settings: Partial<GuardrailSettings>): GuardrailSettings {
    this.guardrails = { ...this.guardrails, ...settings };
    return this.guardrails;
  }

  public getCustomers(): Customer[] {
    return Array.from(this.customers.values());
  }

  public resetToSeed(): void {
    this.cases.clear();
    this.customers.clear();
    this.initialized = false;
    this.init();
  }

  public getMetrics(): RecoveryMetrics {
    const allCases = this.getAllCases();
    
    let totalRevenueAtRisk = 0;
    let totalRevenueRecovered = 0;
    let totalRecoverableRevenue = 0;
    let activeWorkflowsCount = 0;
    let resolvedCasesCount = 0;
    let escalatedCasesCount = 0;
    let totalInterventionsRun = 0;
    let successfulInterventionsCount = 0;
    let totalRecoveryDurationSeconds = 0;
    let recoveredCasesWithTiming = 0;

    const categoryMap = new Map<LossCategory, { atRisk: number; recovered: number; total: number; recoveredCount: number }>();
    const interventionMap = new Map<InterventionType, { count: number; successCount: number; recoveredAmount: number }>();

    const categories: LossCategory[] = [
      'PAYMENT_FAILURE',
      'CHECKOUT_ABANDONMENT',
      'FAILED_SUBSCRIPTION',
      'MANDATE_RETRY',
      'B2B_OVERDUE_RECEIVABLE'
    ];

    categories.forEach(cat => {
      categoryMap.set(cat, { atRisk: 0, recovered: 0, total: 0, recoveredCount: 0 });
    });

    allCases.forEach(c => {
      totalRevenueAtRisk += c.amount;
      const catStat = categoryMap.get(c.category) || { atRisk: 0, recovered: 0, total: 0, recoveredCount: 0 };
      catStat.atRisk += c.amount;
      catStat.total += 1;

      if (c.status === 'RECOVERED') {
        const recAmt = c.recoveredAmount || c.amount;
        totalRevenueRecovered += recAmt;
        resolvedCasesCount += 1;
        catStat.recovered += recAmt;
        catStat.recoveredCount += 1;

        if (c.recoveredAt && c.detectedAt) {
          const durationSec = (new Date(c.recoveredAt).getTime() - new Date(c.detectedAt).getTime()) / 1000;
          if (durationSec > 0) {
            totalRecoveryDurationSeconds += durationSec;
            recoveredCasesWithTiming += 1;
          }
        }
      } else if (c.status === 'ESCALATED') {
        escalatedCasesCount += 1;
      } else {
        activeWorkflowsCount += 1;
        totalRecoverableRevenue += (c.amount * (c.recoveryConfidence / 100));
      }

      categoryMap.set(c.category, catStat);

      c.interventions.forEach(intv => {
        totalInterventionsRun += 1;
        const intvStat = interventionMap.get(intv.type) || { count: 0, successCount: 0, recoveredAmount: 0 };
        intvStat.count += 1;
        if (intv.status === 'SUCCESS') {
          intvStat.successCount += 1;
          if (c.status === 'RECOVERED') {
            intvStat.recoveredAmount += (c.recoveredAmount || c.amount);
            successfulInterventionsCount += 1;
          }
        }
        interventionMap.set(intv.type, intvStat);
      });
    });

    totalRecoverableRevenue += totalRevenueRecovered;

    const overallRecoveryRate = totalRevenueAtRisk > 0 
      ? Number(((totalRevenueRecovered / totalRevenueAtRisk) * 100).toFixed(1))
      : 0;

    const averageRecoveryTimeSeconds = recoveredCasesWithTiming > 0
      ? Math.round(totalRecoveryDurationSeconds / recoveredCasesWithTiming)
      : 180;

    const categoryBreakdown = categories.map(category => {
      const stat = categoryMap.get(category)!;
      return {
        category,
        atRisk: stat.atRisk,
        recovered: stat.recovered,
        recoveryRate: stat.atRisk > 0 ? Number(((stat.recovered / stat.atRisk) * 100).toFixed(1)) : 0
      };
    });

    const interventionPerformance = Array.from(interventionMap.entries()).map(([type, stat]) => ({
      type,
      count: stat.count,
      successRate: stat.count > 0 ? Math.round((stat.successCount / stat.count) * 100) : 0,
      recoveredAmount: stat.recoveredAmount
    }));

    const recentRecoveryEvents = allCases
      .filter(c => c.status === 'RECOVERED')
      .slice(0, 8)
      .map(c => ({
        id: c.id,
        customerName: c.customer.name,
        amount: c.recoveredAmount || c.amount,
        intervention: c.lastInterventionType || 'SMART_RETRY_DOWNTIME_OPTIMAL',
        timestamp: c.recoveredAt || c.updatedAt
      }));

    return {
      totalRevenueAtRisk,
      totalRecoverableRevenue: Math.round(totalRecoverableRevenue),
      totalRevenueRecovered,
      overallRecoveryRate,
      activeWorkflowsCount,
      resolvedCasesCount,
      escalatedCasesCount,
      totalInterventionsRun,
      successfulInterventionsCount,
      averageRecoveryTimeSeconds,
      categoryBreakdown,
      interventionPerformance,
      recentRecoveryEvents
    };
  }
}

export const store = RecoverAIStore.getInstance();
