/** Server-side Gemini diagnosis and bounded playbook recommendation. */
import { GoogleGenAI } from '@google/genai';
import type { RecoveryCaseRecord, CustomerRecord, GuardrailPolicy } from './db';
import type { AIDecisionRecord } from './ai-decision';
import { createAIDecision } from './ai-decision';
import { PlaybookType, PLAYBOOK_CONFIGS } from './playbooks';

const PROVIDER = 'Gemini';
// Keep the model server-configurable while using the requested stable model by
// default. The SDK's Google AI backend is pinned to the documented v1beta API.
const MODEL = process.env.GEMINI_MODEL?.trim() || 'gemini-3.6-flash';
const API_VERSION = 'v1beta';
const API_METHOD = 'models.generateContent';
const REQUEST_TIMEOUT_MS = 20_000;
const MAX_ATTEMPTS = 3;
const RETRY_DELAYS_MS = [250, 750];
type GeminiHealthStatus = 'AVAILABLE' | 'DEGRADED' | 'QUOTA_LIMITED';
let geminiHealth: { status: GeminiHealthStatus; reason: string } = {
  status: process.env.GEMINI_API_KEY?.trim() ? 'DEGRADED' : 'DEGRADED',
  reason: process.env.GEMINI_API_KEY?.trim() ? 'No successful Gemini request has been observed in this runtime.' : 'GEMINI_API_KEY is not configured.',
};
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

function normalizeCaseForGemini(recCase: RecoveryCaseRecord): RecoveryCaseRecord {
  const numeric = (value: unknown, fallbackValue: number) =>
    typeof value === 'number' && Number.isFinite(value) ? value : fallbackValue;
  const text = (value: unknown, fallbackValue: string) =>
    typeof value === 'string' && value.trim() ? value.trim() : fallbackValue;
  return {
    ...recCase,
    id: text(recCase.id, 'unknown-case'),
    customer_id: text(recCase.customer_id, 'unknown-customer'),
    customer_name: text(recCase.customer_name, 'Unknown customer'),
    customer_email: text(recCase.customer_email, 'unavailable'),
    customer_segment: text(recCase.customer_segment, 'UNKNOWN'),
    failure_reason: text(recCase.failure_reason, 'UNKNOWN_FAILURE'),
    currency: text(recCase.currency, 'INR'),
    status: text(recCase.status, 'DETECTED') as RecoveryCaseRecord['status'],
    current_step: text(recCase.current_step, 'DETECTED'),
    amount: Math.max(0, numeric(recCase.amount, 0)),
    customer_risk_score: Math.max(0, Math.min(100, numeric(recCase.customer_risk_score, 0))),
    recovery_confidence: Math.max(0, Math.min(100, numeric(recCase.recovery_confidence, 0))),
    retry_count: Math.max(0, numeric(recCase.retry_count, 0)),
    max_retries: Math.max(0, numeric(recCase.max_retries, 3)),
  };
}

function fallback(recCase: RecoveryCaseRecord, guardrails: GuardrailPolicy, customer: CustomerRecord | undefined, reason: string, raw?: string): AIDecisionRecord {
  return { ...createAIDecision(recCase, guardrails, customer), aiFallbackUsed: true, aiFallbackReason: reason, aiRawResponse: raw || undefined };
}

function providerStatus(error: unknown): number | undefined {
  if (!error || typeof error !== 'object') return undefined;
  const status = (error as { status?: unknown }).status;
  return typeof status === 'number' ? status : undefined;
}

function providerMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === 'string') return error;
  return 'Unknown provider error';
}

function safeFailureReason(error: unknown): string {
  const status = providerStatus(error);
  const message = providerMessage(error);
  if (status === 400 && /API_KEY_INVALID|api key not valid|invalid.argument/i.test(message)) {
    return 'Gemini rejected the server credential (HTTP 400 API_KEY_INVALID)';
  }
  if (status === 401 || status === 403) return `Gemini authorization rejected (HTTP ${status})`;
  if (status === 404) return `Gemini model or endpoint not found (HTTP 404)`;
  if (status === 429) return 'Gemini rate limit or quota exceeded (HTTP 429)';
  if (status && status >= 500) return `Gemini provider error (HTTP ${status})`;
  if (/timed out/i.test(message)) return 'Gemini request timed out';
  if (/fetch failed|network|socket|connect/i.test(message)) return 'Gemini network request failed';
  return 'Gemini request failed';
}

function diagnosticMessage(error: unknown): string {
  // Provider errors are useful in server logs, but never emit credentials,
  // headers, prompts, customer data, or an unbounded SDK payload.
  return providerMessage(error)
    .replace(/(x-goog-api-key|authorization|api[-_ ]?key)\s*[:=]\s*[^,\s}]+/gi, '$1=[redacted]')
    .slice(0, 240);
}

function isTransient(error: unknown): boolean {
  const status = providerStatus(error);
  if (status === 429 || (status !== undefined && status >= 500)) return true;
  return /timed out|fetch failed|network|socket|connect|temporar/i.test(providerMessage(error));
}

function wait(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function getAIDecision(recCase: RecoveryCaseRecord, guardrails: GuardrailPolicy, customer?: CustomerRecord): Promise<AIDecisionRecord> {
  const normalizedCase = normalizeCaseForGemini(recCase);
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey?.trim()) {
    geminiHealth = { status: 'DEGRADED', reason: 'GEMINI_API_KEY is not configured.' };
    return fallback(normalizedCase, guardrails, customer, 'GEMINI_API_KEY not configured');
  }
  let rawText = '';
  const ai = new GoogleGenAI({ apiKey, httpOptions: { apiVersion: API_VERSION } });
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      const response = await Promise.race([
        ai.models.generateContent({
          model: MODEL,
          contents: buildCaseContext(normalizedCase, guardrails, customer),
          // Gemini 3.6 supports structured output; no legacy thinking option
          // is needed for this short diagnosis/recommendation request.
          config: { systemInstruction: SYSTEM_INSTRUCTION, temperature: 0.1, maxOutputTokens: 2048, responseMimeType: 'application/json' },
        }),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Gemini request timed out')), REQUEST_TIMEOUT_MS)),
      ]);
      rawText = response.text?.trim() || '';
      const jsonText = rawText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
      let parsed: unknown;
      try { parsed = JSON.parse(jsonText); } catch { throw new Error('Gemini returned invalid JSON'); }
      if (!isValidResponse(parsed)) throw new Error('Gemini response failed schema or playbook validation');
      geminiHealth = { status: 'AVAILABLE', reason: 'Last Gemini response was received and validated.' };
      const recommendation = parsed.recommendedPlaybook as PlaybookType;
      const base = createAIDecision({ ...normalizedCase, playbook: recommendation }, guardrails, customer);
      return {
        ...base, detectedIssue: parsed.rootCause, diagnosis: parsed.diagnosis,
        confidencePercent: Math.round(parsed.confidence * 100), confidence: parsed.confidence >= 0.75 ? 'HIGH' : parsed.confidence >= 0.5 ? 'MEDIUM' : 'LOW',
        source: 'GEMINI_AI', aiProvider: PROVIDER, aiModel: MODEL, aiRootCause: parsed.rootCause,
        aiReasoning: parsed.reasoning, aiRelevantSignals: parsed.relevantSignals, aiRawResponse: rawText,
        aiFallbackUsed: false, selectedPlaybook: base.selectedPlaybook,
      };
    } catch (error) {
      console.warn('[RecoverAI Gemini diagnostic]', {
        model: MODEL,
        apiVersion: API_VERSION,
        method: API_METHOD,
        status: providerStatus(error) ?? 'unknown',
        error: diagnosticMessage(error),
        attempt,
      });
      if (providerStatus(error) === 429) geminiHealth = { status: 'QUOTA_LIMITED', reason: 'Gemini returned HTTP 429 quota/rate-limit response.' };
      else geminiHealth = { status: 'DEGRADED', reason: safeFailureReason(error) };
      // Schema/model/auth errors are permanent. Only transient transport,
      // quota, and provider failures receive bounded exponential backoff.
      if (!isTransient(error) || attempt === MAX_ATTEMPTS) {
        return fallback(normalizedCase, guardrails, customer, safeFailureReason(error), rawText);
      }
      await wait(RETRY_DELAYS_MS[attempt - 1] ?? RETRY_DELAYS_MS.at(-1)!);
    }
  }
  return fallback(normalizedCase, guardrails, customer, 'Gemini request failed');
}

export { MODEL as GEMINI_MODEL };

export function getGeminiHealth() {
  return {
    ...geminiHealth,
    model: MODEL,
    sdk: '@google/genai',
    endpoint: 'Google AI Generative Language API / v1beta / models.generateContent',
    keyConfigured: Boolean(process.env.GEMINI_API_KEY?.trim()),
    fallbackActive: geminiHealth.status !== 'AVAILABLE',
  };
}
