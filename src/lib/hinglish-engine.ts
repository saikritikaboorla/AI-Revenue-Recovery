import type { RecoveryCaseRecord } from './db';

export type HinglishTurn = {
  speaker: 'RECOVERAI' | 'CUSTOMER';
  message: string;
  state: string;
  timestamp: string;
};

export type HinglishTranscript = {
  channel: 'WhatsApp' | 'Voice';
  language: 'Hinglish';
  branch: 'PAY_NOW' | 'RESCHEDULE' | 'DISPUTE' | 'ESCALATE';
  turns: HinglishTurn[];
  finalOutcome: 'RECOVERED' | 'PROMISE_TO_PAY' | 'ESCALATED' | 'STOPPED';
  paymentIntent: boolean;
};

function toneFor(caseRecord: RecoveryCaseRecord) {
  const score = caseRecord.customer_risk_score;
  if (score >= 70) return 'firm';
  if (score >= 45) return 'balanced';
  return 'warm';
}

function openingLine(caseRecord: RecoveryCaseRecord) {
  const tone = toneFor(caseRecord);
  if (caseRecord.failure_reason.includes('AUTH_FAILED') || caseRecord.failure_reason.includes('DROPPED')) {
    return tone === 'firm'
      ? `Namaste ${caseRecord.customer_name}. Payment process mein issue aaya tha. Main aapko quick retry option de raha hoon.`
      : `Hi ${caseRecord.customer_name}, payment complete nahi hua tha. Main aapke liye easy retry option bhej raha hoon.`;
  }
  if (caseRecord.failure_reason.includes('INSUFFICIENT_FUNDS') || caseRecord.failure_reason.includes('MANDATE')) {
    return `Namaste ${caseRecord.customer_name}. Mandate debit aaj pass nahi hua. Kya hum next salary window pe retry plan kar sakte hain?`;
  }
  return `Namaste ${caseRecord.customer_name}. Aapka ₹${caseRecord.amount.toLocaleString('en-IN')} recovery follow-up pending hai. Main abhi simplest next step share karta hoon.`;
}

function customerBranch(caseRecord: RecoveryCaseRecord): { branch: HinglishTranscript['branch']; reply: string; finalOutcome: HinglishTranscript['finalOutcome'] } {
  const reason = caseRecord.failure_reason;
  if (reason.includes('DISPUTE') || reason.includes('PO_MISMATCH')) {
    return { branch: 'ESCALATE', reply: 'Nahi, abhi dispute hai. Pehle support team dekh le.', finalOutcome: 'ESCALATED' };
  }
  if (reason.includes('INSUFFICIENT_FUNDS') || reason.includes('DEFERRED_SALARY')) {
    return { branch: 'RESCHEDULE', reply: 'Salary ke baad karunga. Please reminder bhej do.', finalOutcome: 'PROMISE_TO_PAY' };
  }
  if (reason.includes('DROPOFF') || reason.includes('AUTH_FAILED') || reason.includes('PAYMENT_FAILED') || reason.includes('DROPPED')) {
    return { branch: 'PAY_NOW', reply: 'Haan, abhi retry kar leta hoon.', finalOutcome: 'RECOVERED' };
  }
  return { branch: caseRecord.customer_risk_score >= 65 ? 'ESCALATE' : 'PAY_NOW', reply: caseRecord.customer_risk_score >= 65 ? 'Abhi hold karo, finance se baat karni hogi.' : 'Link bhejo, main abhi pay karta hoon.', finalOutcome: caseRecord.customer_risk_score >= 65 ? 'ESCALATED' : 'RECOVERED' };
}

export function buildHinglishTranscript(caseRecord: RecoveryCaseRecord): HinglishTranscript {
  const now = new Date(caseRecord.updated_at || caseRecord.created_at || Date.now());
  const branch = customerBranch(caseRecord);
  const turns: HinglishTurn[] = [
    { speaker: 'RECOVERAI', message: openingLine(caseRecord), state: 'OPENING', timestamp: new Date(now.getTime() - 120000).toISOString() },
    { speaker: 'CUSTOMER', message: branch.reply, state: 'RESPONSE', timestamp: new Date(now.getTime() - 80000).toISOString() },
  ];

  if (branch.branch === 'PAY_NOW') {
    turns.push(
      { speaker: 'RECOVERAI', message: `Theek hai. Main secure payment link bhej raha hoon for ₹${caseRecord.amount.toLocaleString('en-IN')}.`, state: 'PAYMENT_LINK', timestamp: new Date(now.getTime() - 40000).toISOString() },
      { speaker: 'CUSTOMER', message: 'Done. Payment processed.', state: 'CONFIRMATION', timestamp: new Date(now.getTime() - 10000).toISOString() },
    );
  } else if (branch.branch === 'RESCHEDULE') {
    turns.push(
      { speaker: 'RECOVERAI', message: 'Samajh gaya. Main Promise-to-Pay note create kar raha hoon aur reminder schedule kar deta hoon.', state: 'RESCHEDULE', timestamp: new Date(now.getTime() - 40000).toISOString() },
      { speaker: 'CUSTOMER', message: 'Haan, next window pe settle kar dunga.', state: 'PROMISE', timestamp: new Date(now.getTime() - 10000).toISOString() },
    );
  } else {
    turns.push(
      { speaker: 'RECOVERAI', message: 'I hear you. Main case ko human collections specialist ko handoff kar raha hoon with full context.', state: 'ESCALATE', timestamp: new Date(now.getTime() - 40000).toISOString() },
      { speaker: 'CUSTOMER', message: 'Theek hai, team ke saath follow up kar lo.', state: 'HANDOFF', timestamp: new Date(now.getTime() - 10000).toISOString() },
    );
  }

  return {
    channel: caseRecord.customer_segment === 'ENTERPRISE' ? 'Voice' : 'WhatsApp',
    language: 'Hinglish',
    branch: branch.branch,
    turns,
    finalOutcome: branch.finalOutcome,
    paymentIntent: branch.branch === 'PAY_NOW',
  };
}
