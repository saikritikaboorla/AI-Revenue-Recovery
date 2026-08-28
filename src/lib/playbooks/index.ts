export type PlaybookType =
  | 'PAYMENT_DEGRADATION'
  | 'CHECKOUT_ABANDONMENT'
  | 'FAILED_SUBSCRIPTION'
  | 'B2B_OVERDUE_RECEIVABLES'
  | 'MANDATE_RETRY'
  | 'HINGLISH_RECOVERY'
  | 'PROMISE_TO_PAY';

export interface PlaybookConfig {
  type: PlaybookType;
  displayName: string;
  description: string;
  triggerEvent: string;
  allowedActions: string[];
  maxRetries: number;
  cooldownHours: number;
  maxAutonomousRiskScore: number;
  requiresHighValueEscalation: boolean;
  sampleHindiTone?: boolean;
}

export const PLAYBOOK_CONFIGS: Record<PlaybookType, PlaybookConfig> = {
  PAYMENT_DEGRADATION: {
    type: 'PAYMENT_DEGRADATION',
    displayName: 'Payment Degradation & Gateway Failover',
    description: 'Autonomous multi-gateway routing and smart failover via Razorpay Optimizer when issuing banks or UPI rails degrade.',
    triggerEvent: 'payment.failed (504 Gateway Timeout / Netbanking Down)',
    allowedActions: ['switch_gateway_optimizer', 'instant_upi_failover', 'card_network_switch'],
    maxRetries: 3,
    cooldownHours: 0.25,
    maxAutonomousRiskScore: 65,
    requiresHighValueEscalation: false,
  },
  CHECKOUT_ABANDONMENT: {
    type: 'CHECKOUT_ABANDONMENT',
    displayName: 'Checkout Abandonment Cart Recovery',
    description: 'Dynamic 1-click cart resumption with pre-authenticated UPI intent links delivered over conversational WhatsApp.',
    triggerEvent: 'checkout.session_expired_without_auth',
    allowedActions: ['send_checkout_resume_link', 'apply_instant_settlement_discount', 'whatsapp_quickpay'],
    maxRetries: 2,
    cooldownHours: 1,
    maxAutonomousRiskScore: 70,
    requiresHighValueEscalation: false,
  },
  FAILED_SUBSCRIPTION: {
    type: 'FAILED_SUBSCRIPTION',
    displayName: 'Recurring Subscription Invoicing',
    description: 'Re-authenticates e-mandates exceeding RBI statutory caps (₹15,000 threshold) with 1-tap 2FA approval links.',
    triggerEvent: 'subscription.charge_failed (Mandate Limit Exceeded)',
    allowedActions: ['request_payment_method_update', 'send_afa_authorization_link', 'offer_grace_period'],
    maxRetries: 3,
    cooldownHours: 12,
    maxAutonomousRiskScore: 60,
    requiresHighValueEscalation: true,
  },
  B2B_OVERDUE_RECEIVABLES: {
    type: 'B2B_OVERDUE_RECEIVABLES',
    displayName: 'B2B Overdue Invoices & Receivables',
    description: 'Corporate receivables management with structured early-payment discount incentives and human relationship escalation.',
    triggerEvent: 'invoice.overdue_net30_breached',
    allowedActions: ['create_payment_link', 'apply_5pct_early_discount', 'escalate_to_relationship_manager'],
    maxRetries: 2,
    cooldownHours: 24,
    maxAutonomousRiskScore: 50,
    requiresHighValueEscalation: true,
  },
  MANDATE_RETRY: {
    type: 'MANDATE_RETRY',
    displayName: 'e-NACH & Mandate Clearing Reschedule',
    description: 'Aligns recurring auto-debit batch schedules with high-liquidity morning clearing windows (06:00 AM IST salary cycles).',
    triggerEvent: 'mandate.debit_declined_insufficient_funds',
    allowedActions: ['schedule_morning_batch_retry', 'split_mandate_charge', 'notify_mandate_update'],
    maxRetries: 3,
    cooldownHours: 24,
    maxAutonomousRiskScore: 60,
    requiresHighValueEscalation: false,
  },
  HINGLISH_RECOVERY: {
    type: 'HINGLISH_RECOVERY',
    displayName: 'Hinglish Conversational Assist',
    description: 'Natural bilingual WhatsApp and SMS conversational outreach designed for high-conversion Indian D2C & Retail consumers.',
    triggerEvent: 'payment.dropped_upi_intent',
    allowedActions: ['send_hinglish_whatsapp_prompt', 'dispatch_assisted_ivr_call', 'send_upi_intent_qr'],
    maxRetries: 2,
    cooldownHours: 2,
    maxAutonomousRiskScore: 75,
    requiresHighValueEscalation: false,
    sampleHindiTone: true,
  },
  PROMISE_TO_PAY: {
    type: 'PROMISE_TO_PAY',
    displayName: 'Promise-to-Pay (P2P) Tracker & Guardrail',
    description: 'Formalizes customer settlement commitments with calendar milestones and automatic escalation upon promise breach.',
    triggerEvent: 'customer.promise_to_pay_created',
    allowedActions: ['create_promise_to_pay', 'send_milestone_reminder', 'escalate_broken_promise'],
    maxRetries: 1,
    cooldownHours: 48,
    maxAutonomousRiskScore: 55,
    requiresHighValueEscalation: true,
  }
};
