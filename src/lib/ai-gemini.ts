/** Server-side Gemini diagnosis and bounded playbook recommendation. */
import { GoogleGenAI, ThinkingLevel } from '@google/genai';
import type { RecoveryCaseRecord, CustomerRecord, GuardrailPolicy } from './db';
import type { AIDecisionRecord } from './ai-decision';
import { createAIDecision } from './ai-decision';
import { PlaybookType, PLAYBOOK_CONFIGS } from './playbooks';

const PROVIDER = 'Gemini';
// Stable, current Gemini API model used by this integration.
const MODEL = 'gemini-3.6-flash';
const VALID_PLAYBOOKS: PlaybookType[] = [
  'PAYMENT_DEGRADATION', 'CHECKOUT_ABANDONMENT', 'FAILED_SUBSCRIPTION',
  'B2B_OVERDUE_RECEIVABLES', 'MANDATE_RETRY', 'HINGLISH_RECOVERY', 'PROMISE_TO_PAY',
];

const SYSTEM_INSTRUCTION = `You are the diagnosis and recovery recommendation layer of RecoverAI.
Analyze the supplied case and recommend exactly one playbook from the supplied fixed candidate list.
You may only recommend an existing playbook. You cannot execute actions, modify guardrails, change retry limits or thresholds, write a ledger, claim recovery, approve escalation, or fabricate settlement proof. Deterministic downstream rules are the final authority.
Return only JSON matching this schema: {"diagnosis":"1-3 sentences","rootCause":"short label","confidence":0.0,"recommendedPlaybook":"EXACT candidate","reasoning":"concise case-specific rationale","relevantSignals":["signal"]}`;

interface GeminiDiagnosisResponse {
  diagnosis: string; rootCause: string; confidence: number; recommendedPlaybook: string;
  reasoning: string; relevantSignals: string[];
}

function isValidResponse(value: unknown): value is GeminiDiagnosisResponse {
  if (!value || typeof value !== 'object') return false;
  const r = value as Record<string, unknown>;
  return typeof r.diagnosis === 'string' && r.diagnosis.trim().length > 0 && r.diagnosis.length <= 1000
    && typeof r.rootCause === 'string' && r.rootCause.trim().length > 0 && r.rootCause.length <= 240
    && typeof r.confidence === 'number' && Number.isFinite(r.confidence) && r.confidence >= 0 && r.confidence <= 1
    && typeof r.recommendedPlaybook === 'string' && VALID_PLAYBOOKS.includes(r.recommendedPlaybook as PlaybookType)
    && typeof r.reasoning === 'string' && r.reasoning.trim().length > 0 && r.reasoning.length <= 1000
    && Array.isArray(r.relevantSignals) && r.relevantSignals.length <= 8
    && r.relevantSignals.every(signal => typeof signal === 'string' && signal.trim().length > 0 && signal.length <= 240);
}

function buildCaseContext(recCase: RecoveryCaseRecord, guardrails: GuardrailPolicy, customer?: CustomerRecord): string {
  const config = PLAYBOOK_CONFIGS[recCase.playbook];
  const lines = [
    'CASE CONTEXT (use only these case signals; do not infer secrets)',
    `Failure reason: ${recCase.failure_reason.replace(/_/g, ' ')}`,
    `Amount at risk: ${recCase.amount} ${recCase.currency}`,
    `Customer segment: ${recCase.customer_segment.replace(/_/g, ' ')}`,
    `Risk score: ${recCase.customer_risk_score}/100`,
    `Retry count: ${recCase.retry_count}; case max retries: ${config?.maxRetries ?? recCase.max_retries}; policy max retries: ${guardrails.maxRetries}`,
    `Payment context: current playbook ${recCase.playbook}; status ${recCase.status}; recovery confidence ${recCase.recovery_confidence}%`,
    customer ? `Customer context: historical recovery ${customer.past_recovery_rate}%; contact preference ${customer.contact_preference}; lifetime value ${customer.lifetime_value} ${recCase.currency}` : 'Customer context: unavailable',
    '', 'AVAILABLE PLAYBOOKS (choose exactly one):',
    ...VALID_PLAYBOOKS.map(pb => `- ${pb}: ${PLAYBOOK_CONFIGS[pb].displayName} — ${PLAYBOOK_CONFIGS[pb].description}`),
    '', 'Guardrails are supplied for awareness only and must not be changed.',
  ];
  return lines.join('\n');
}

function fallback(recCase: RecoveryCaseRecord, guardrails: GuardrailPolicy, customer: CustomerRecord | undefined, reason: string, raw?: string): AIDecisionRecord {
  return { ...createAIDecision(recCase, guardrails, customer), aiFallbackUsed: true, aiFallbackReason: reason, aiRawResponse: raw || undefined };
}

export async function getAIDecision(recCase: RecoveryCaseRecord, guardrails: GuardrailPolicy, customer?: CustomerRecord): Promise<AIDecisionRecord> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey?.trim()) return fallback(recCase, guardrails, customer, 'GEMINI_API_KEY not configured');
  let rawText = '';
  try {
    const ai = new GoogleGenAI({ apiKey });
    const response = await Promise.race([
      ai.models.generateContent({
        model: MODEL,
        contents: buildCaseContext(recCase, guardrails, customer),
        config: { systemInstruction: SYSTEM_INSTRUCTION, temperature: 0.1, maxOutputTokens: 2048, responseMimeType: 'application/json', thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL } },
      }),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Gemini request timed out')), 20000)),
    ]);
    rawText = response.text?.trim() || '';
    const jsonText = rawText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
    let parsed: unknown;
    try { parsed = JSON.parse(jsonText); } catch { throw new Error('Gemini returned invalid JSON'); }
    if (!isValidResponse(parsed)) throw new Error('Gemini response failed schema or playbook validation');
    const recommendation = parsed.recommendedPlaybook as PlaybookType;
    const base = createAIDecision({ ...recCase, playbook: recommendation }, guardrails, customer);
    return {
      ...base, detectedIssue: parsed.rootCause, diagnosis: parsed.diagnosis,
      confidencePercent: Math.round(parsed.confidence * 100), confidence: parsed.confidence >= 0.75 ? 'HIGH' : parsed.confidence >= 0.5 ? 'MEDIUM' : 'LOW',
      source: 'GEMINI_AI', aiProvider: PROVIDER, aiModel: MODEL, aiRootCause: parsed.rootCause,
      aiReasoning: parsed.reasoning, aiRelevantSignals: parsed.relevantSignals, aiRawResponse: rawText,
      aiFallbackUsed: false, selectedPlaybook: base.selectedPlaybook,
    };
  } catch (error) {
    const reason = error instanceof Error && /invalid JSON|schema|playbook|timed out/i.test(error.message) ? error.message : 'Gemini request failed or timed out';
    return fallback(recCase, guardrails, customer, reason, rawText);
  }
}

export { MODEL as GEMINI_MODEL };
