import type { RecoveryCaseRecord } from './db';

export type HinglishSpeaker = 'RECOVERAI' | 'CUSTOMER';

export type HinglishState =
  | 'OPENING'
  | 'ISSUE_CONFIRMATION'
  | 'ACTION_OFFER'
  | 'CUSTOMER_RESPONSE'
  | 'OBJECTION_HANDLING'
  | 'FINAL_OUTCOME';

export type HinglishBranch = 'PAY_NOW' | 'RESCHEDULE' | 'DISPUTE' | 'ESCALATE';

export type HinglishTurn = {
  speaker: HinglishSpeaker;
  message: string;
  state: HinglishState;
  timestamp: string;
};

export type HinglishTranscript = {
  channel: 'WhatsApp' | 'Voice';
  language: 'Hinglish';
  branch: HinglishBranch;
  failureReason: string;
  selectedAction: string;
  outcome: 'RECOVERED' | 'PROMISE_TO_PAY' | 'ESCALATED' | 'STOPPED';
  settlementVerified: boolean;
  recoveredAmount: number;
  ledgerEntryId?: string;
  transitions: Array<{ currentState: HinglishState; customerResponse: string; nextState: HinglishState; outcome: HinglishTranscript['outcome'] }>;
  turns: HinglishTurn[];
};

function toneFor(caseRecord: RecoveryCaseRecord) {
  if (caseRecord.customer_risk_score >= 70 || caseRecord.amount >= 50000) return 'firm';
  if (caseRecord.customer_risk_score >= 45) return 'balanced';
  return 'warm';
}

function simBase(caseRecord: RecoveryCaseRecord) {
  const anchor = new Date(caseRecord.recovered_at || caseRecord.updated_at || caseRecord.created_at || Date.now());
  return {
    opening: new Date(anchor.getTime() - 140000).toISOString(),
    confirm: new Date(anchor.getTime() - 110000).toISOString(),
    action: new Date(anchor.getTime() - 80000).toISOString(),
    response: new Date(anchor.getTime() - 50000).toISOString(),
    objection: new Date(anchor.getTime() - 25000).toISOString(),
    outcome: new Date(anchor.getTime() - 5000).toISOString(),
  };
}

function failureNarrative(caseRecord: RecoveryCaseRecord): string {
  const reason = caseRecord.failure_reason;
  if (reason.includes('AUTH_FAILED_OTP_TIMEOUT')) return 'OTP timeout during payment authorization';
  if (reason.includes('INSUFFICIENT_FUNDS')) return 'insufficient balance at debit time';
  if (reason.includes('MANDATE_LIMIT_EXCEEDED')) return 'mandate limit exceeded for auto-debit';
  if (reason.includes('CUSTOMER_DROPOFF')) return 'checkout abandoned before payment completion';
  if (reason.includes('INVOICE_OVERDUE')) return 'overdue invoice beyond agreed credit window';
  if (reason.includes('BANK_DOWNTIME')) return 'temporary payment rail downtime';
  return reason.replace(/_/g, ' ').toLowerCase();
}

function determineBranch(caseRecord: RecoveryCaseRecord): { branch: HinglishBranch; customerReply: string; action: string; outcome: HinglishTranscript['outcome']; reason: string } {
  const reason = caseRecord.failure_reason;
  if (reason.includes('AUTH_FAILED_OTP_TIMEOUT') || reason.includes('DROPPED_CALL_ASSIST')) {
    return {
      branch: caseRecord.customer_risk_score >= 65 ? 'ESCALATE' : 'PAY_NOW',
      customerReply: caseRecord.customer_risk_score >= 65 ? 'OTP ka issue baar baar aa raha hai, please team se assist karwa do.' : 'OTP aa gaya, main abhi retry kar deta hoon.',
      action: 'Assisted retry with fresh payment link and shorter expiry window.',
      outcome: caseRecord.customer_risk_score >= 65 ? 'ESCALATED' : 'RECOVERED',
      reason: 'OTP timeout',
    };
  }
  if (reason.includes('INSUFFICIENT_FUNDS') || reason.includes('MANDATE') || reason.includes('SALARY')) {
    return {
      branch: 'RESCHEDULE',
      customerReply: 'Salary credit ke baad kar deta hoon. Reminder bhej dena.',
      action: 'Promise-to-Pay reschedule aligned to the next liquidity window.',
      outcome: 'PROMISE_TO_PAY',
      reason: 'insufficient funds / mandate retry',
    };
  }
  if (reason.includes('CUSTOMER_DROPOFF') || reason.includes('DROPOFF') || reason.includes('REGIONAL_UPI')) {
    return {
      branch: 'PAY_NOW',
      customerReply: 'Thoda confused tha, abhi link bhejo main complete karta hoon.',
      action: 'Send WhatsApp checkout resume link with one-tap payment.',
      outcome: 'RECOVERED',
      reason: 'checkout abandonment',
    };
  }
  if (reason.includes('INVOICE_OVERDUE') || reason.includes('PAYMENT_FAILED') || reason.includes('BANK_DOWNTIME')) {
    return {
      branch: caseRecord.customer_risk_score >= 70 || caseRecord.amount >= 100000 ? 'ESCALATE' : 'PAY_NOW',
      customerReply: caseRecord.customer_risk_score >= 70 || caseRecord.amount >= 100000
        ? 'Abhi finance team ko loop mein lao, main confirm kar deta hoon.'
        : 'Haan, abhi set karta hoon.',
      action: caseRecord.customer_risk_score >= 70 || caseRecord.amount >= 100000
        ? 'Escalate with complete payment context and human follow-up.'
        : 'Send secure payment link and verify settlement.',
      outcome: caseRecord.customer_risk_score >= 70 || caseRecord.amount >= 100000 ? 'ESCALATED' : 'RECOVERED',
      reason: reason.includes('INVOICE_OVERDUE') ? 'overdue receivable' : 'payment rail issue',
    };
  }
  return {
    branch: caseRecord.customer_risk_score >= 68 ? 'ESCALATE' : 'PAY_NOW',
    customerReply: caseRecord.customer_risk_score >= 68 ? 'Please hold, I need to check with my team.' : 'Send the link, I can settle now.',
    action: caseRecord.customer_risk_score >= 68 ? 'Route to human collections review.' : 'Offer immediate payment link.',
    outcome: caseRecord.customer_risk_score >= 68 ? 'ESCALATED' : 'RECOVERED',
    reason: 'case risk and failure context',
  };
}

export function buildHinglishTranscript(caseRecord: RecoveryCaseRecord): HinglishTranscript {
  const timing = simBase(caseRecord);
  const tone = toneFor(caseRecord);
  const branch = determineBranch(caseRecord);
  const ledgerEntry = caseRecord.status === 'RECOVERED' && caseRecord.recovered_amount > 0
    ? `ledg_${caseRecord.id}_settlement`
    : undefined;

  const opening = caseRecord.failure_reason.includes('AUTH_FAILED') || caseRecord.failure_reason.includes('DROPPED_CALL')
    ? `Namaste ${caseRecord.customer_name}, payment ${failureNarrative(caseRecord)} ki wajah se ruk gaya tha. Main fresh retry help kar raha hoon.`
    : caseRecord.failure_reason.includes('INSUFFICIENT_FUNDS') || caseRecord.failure_reason.includes('MANDATE')
      ? `Namaste ${caseRecord.customer_name}, debit ${failureNarrative(caseRecord)} ki wajah se fail hua. Kya hum next salary window pe plan karen?`
      : caseRecord.failure_reason.includes('INVOICE_OVERDUE')
        ? `Namaste ${caseRecord.customer_name}, aapka ₹${caseRecord.amount.toLocaleString('en-IN')} receivable pending hai. Main next step clear karta hoon.`
        : caseRecord.failure_reason.includes('REGIONAL_UPI')
          ? `Namaste ${caseRecord.customer_name}, UPI intent screen par checkout complete nahi hua tha. Main resume link bhej raha hoon.`
          : `Namaste ${caseRecord.customer_name}, aapka ₹${caseRecord.amount.toLocaleString('en-IN')} recovery follow-up pending hai.`;

  const turns: HinglishTurn[] = [
    { speaker: 'RECOVERAI', message: opening, state: 'OPENING', timestamp: timing.opening },
    { speaker: 'RECOVERAI', message: `Issue confirm ho gaya: ${failureNarrative(caseRecord)}. Channel ${caseRecord.customer_segment === 'ENTERPRISE' ? 'Voice' : 'WhatsApp'} rakhen?`, state: 'ISSUE_CONFIRMATION', timestamp: timing.confirm },
    { speaker: 'RECOVERAI', message: branch.branch === 'RESCHEDULE'
      ? `Main ${caseRecord.amount.toLocaleString('en-IN')} ke liye Promise-to-Pay reschedule propose kar raha hoon.`
      : branch.branch === 'ESCALATE'
        ? `Main secure handoff ke saath human review route kar raha hoon.`
        : `Main secure payment link bhej raha hoon for ₹${caseRecord.amount.toLocaleString('en-IN')}.`, state: 'ACTION_OFFER', timestamp: timing.action },
    { speaker: 'CUSTOMER', message: branch.customerReply, state: 'CUSTOMER_RESPONSE', timestamp: timing.response },
    { speaker: 'RECOVERAI', message: branch.branch === 'RESCHEDULE'
      ? 'Theek hai, reminder aur due date note kar diya. Aapko next settlement window pe ping karenge.'
      : branch.branch === 'ESCALATE'
        ? `Samajh gaya. Main case ko human collections specialist ko handoff kar raha hoon with full context.`
        : tone === 'firm'
          ? 'Done. Verification ping aate hi case close kar diya jayega.'
          : 'Perfect. Payment verify hote hi recovery mark kar dete hain.', state: 'OBJECTION_HANDLING', timestamp: timing.objection },
    { speaker: 'RECOVERAI', message: branch.outcome === 'RECOVERED'
      ? `Final outcome: recovered amount ₹${Math.max(caseRecord.recovered_amount, caseRecord.amount).toLocaleString('en-IN')} verified.`
      : branch.outcome === 'PROMISE_TO_PAY'
        ? `Final outcome: promise logged for ₹${caseRecord.amount.toLocaleString('en-IN')} and follow-up scheduled.`
        : `Final outcome: escalated for human review. No recovery claim is made here.`, state: 'FINAL_OUTCOME', timestamp: timing.outcome },
  ];

  const transitions = turns.slice(0, -1).map((turn, index) => ({
    currentState: turn.state,
    customerResponse: turns[index + 1].speaker === 'CUSTOMER' ? turns[index + 1].message : 'Customer response recorded by deterministic simulator.',
    nextState: turns[index + 1].state,
    outcome: index === turns.length - 2 ? branch.outcome : 'STOPPED' as const,
  }));

  return {
    channel: caseRecord.customer_segment === 'ENTERPRISE' ? 'Voice' : 'WhatsApp',
    language: 'Hinglish',
    branch: branch.branch,
    failureReason: caseRecord.failure_reason,
    selectedAction: branch.action,
    outcome: branch.outcome,
    settlementVerified: caseRecord.status === 'RECOVERED' && caseRecord.recovered_amount > 0,
    recoveredAmount: caseRecord.status === 'RECOVERED' ? caseRecord.recovered_amount : 0,
    ledgerEntryId: ledgerEntry,
    transitions,
    turns,
  };
}
