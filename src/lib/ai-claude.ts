/**
 * ai-claude.ts — Server-side Claude/Anthropic diagnosis service.
 *
 * This module is the ONLY place in the codebase that calls the Anthropic API.
 * It runs entirely server-side. The API key is read from the server environment
 * variable ANTHROPIC_API_KEY and is never exposed to client code.
 *
 * Architecture:
 *   Case data → Claude API (server-side only)
 *              ↓
 *   Structured diagnosis + playbook recommendation
 *              ↓
 *   Validation (playbook must be one of the 7 fixed types)
 *              ↓
 *   Merged into AIDecisionRecord
 *              ↓
 *   Existing deterministic guardrails (unchanged)
 *              ↓
 *   Existing bounded recovery action (unchanged)
 *
 * The model may only RECOMMEND. It cannot:
 *   - execute actions
 *   - modify guardrail policy
 *   - change financial thresholds or retry limits
 *   - write to the ledger
 *   - mark money as recovered
 *   - approve escalations
 *   - fabricate settlement
 */

import Anthropic from '@anthropic-ai/sdk';
import type { RecoveryCaseRecord, CustomerRecord, GuardrailPolicy } from './db';
import type { AIDecisionRecord } from './ai-decision';
import { createAIDecision } from './ai-decision';
import { PlaybookType, PLAYBOOK_CONFIGS } from './playbooks';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PROVIDER = 'Anthropic';
const MODEL = 'claude-3-5-haiku-20241022';

/** The only playbooks the model may recommend — mirrors PLAYBOOK_CONFIGS exactly. */
const VALID_PLAYBOOKS: PlaybookType[] = [
  'PAYMENT_DEGRADATION',
  'CHECKOUT_ABANDONMENT',
  'FAILED_SUBSCRIPTION',
  'B2B_OVERDUE_RECEIVABLES',
  'MANDATE_RETRY',
  'HINGLISH_RECOVERY',
  'PROMISE_TO_PAY',
];

// ---------------------------------------------------------------------------
// System prompt
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `You are the diagnosis and recovery recommendation layer of RecoverAI, an AI-assisted revenue recovery platform.

Analyze the supplied revenue-recovery case and recommend exactly one playbook from the fixed candidate list provided in the user message.

STRICT CONSTRAINTS — you cannot violate any of these:
- You cannot invent new playbooks or actions outside the provided candidate list.
- You cannot change financial thresholds, retry limits, cooldowns, or escalation rules.
- You cannot claim that money was recovered. Recovery is only confirmed after the deterministic system verifies settlement.
- You cannot approve escalations, disable guardrails, or authorize bounded actions directly.
- The downstream deterministic engine is the final authority on whether the action can execute.

Return ONLY a JSON object (no markdown, no explanation outside the JSON) with this exact schema:
{
  "diagnosis": "<1-3 sentence root cause analysis based on the case signals>",
  "rootCause": "<concise root cause label, e.g. 'Issuing bank temporary downtime'>",
  "confidence": <number between 0.0 and 1.0>,
  "recommendedPlaybook": "<EXACTLY one playbook type string from the candidate list>",
  "reasoning": "<why this playbook fits this specific case>",
  "relevantSignals": ["<signal 1>", "<signal 2>", "<signal 3>"]
}

Make sure your reasoning is specific to the case data provided. Different cases with different failure reasons, customer segments, and risk profiles should produce meaningfully different diagnoses.`;

// ---------------------------------------------------------------------------
// Claude response schema
// ---------------------------------------------------------------------------

interface ClaudeDiagnosisResponse {
  diagnosis: string;
  rootCause: string;
  confidence: number;
  recommendedPlaybook: string;
  reasoning: string;
  relevantSignals: string[];
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

function isValidClaudeResponse(obj: unknown): obj is ClaudeDiagnosisResponse {
  if (!obj || typeof obj !== 'object') return false;
  const r = obj as Record<string, unknown>;
  if (typeof r.diagnosis !== 'string' || r.diagnosis.trim().length === 0) return false;
  if (typeof r.rootCause !== 'string' || r.rootCause.trim().length === 0) return false;
  if (typeof r.confidence !== 'number' || r.confidence < 0 || r.confidence > 1) return false;
  if (typeof r.recommendedPlaybook !== 'string') return false;
  if (typeof r.reasoning !== 'string' || r.reasoning.trim().length === 0) return false;
  if (!Array.isArray(r.relevantSignals)) return false;
  // Most important: the recommended playbook must be one of the 7 existing types
  if (!VALID_PLAYBOOKS.includes(r.recommendedPlaybook as PlaybookType)) return false;
  return true;
}

// ---------------------------------------------------------------------------
// Case context builder — constructs the user message sent to Claude
// ---------------------------------------------------------------------------

function buildCaseContext(
  recCase: RecoveryCaseRecord,
  guardrails: GuardrailPolicy,
  customer?: CustomerRecord,
): string {
  const config = PLAYBOOK_CONFIGS[recCase.playbook];

  const lines: string[] = [
    '=== REVENUE RECOVERY CASE ===',
    `Case ID: ${recCase.id}`,
    `Customer: ${recCase.customer_name}`,
    `Customer Segment: ${recCase.customer_segment.replace(/_/g, ' ')}`,
    `Customer Risk Score: ${recCase.customer_risk_score}/100`,
    `Amount at Risk: ₹${recCase.amount.toLocaleString('en-IN')} ${recCase.currency}`,
    `Failure Reason: ${recCase.failure_reason.replace(/_/g, ' ')}`,
    `Current Status: ${recCase.status}`,
    `Retry Count: ${recCase.retry_count} (max allowed: ${config?.maxRetries ?? guardrails.maxRetries})`,
    `Recovery Confidence (historical): ${recCase.recovery_confidence}%`,
    '',
  ];

  if (customer) {
    lines.push(
      '=== CUSTOMER HISTORY ===',
      `Historical Recovery Rate: ${customer.past_recovery_rate}%`,
      `Lifetime Value: ₹${customer.lifetime_value.toLocaleString('en-IN')}`,
      `Contact Preference: ${customer.contact_preference}`,
      '',
    );
  }

  lines.push(
    '=== GUARDRAIL CONTEXT (FOR AWARENESS ONLY — DO NOT MODIFY) ===',
    `Max Autonomous Retries: ${guardrails.maxRetries}`,
    `Max Risk Score for Autonomous Action: ${guardrails.maxRiskScoreForAutonomousAction}`,
    `High Value Threshold: ₹${guardrails.highValueThreshold.toLocaleString('en-IN')}`,
    '',
    '=== AVAILABLE PLAYBOOKS (YOU MUST CHOOSE EXACTLY ONE) ===',
  );

  VALID_PLAYBOOKS.forEach(pb => {
    const pbConfig = PLAYBOOK_CONFIGS[pb];
    lines.push(`- ${pb}: ${pbConfig.displayName} — ${pbConfig.description}`);
  });

  lines.push(
    '',
    '=== INSTRUCTIONS ===',
    'Based on the case signals above, diagnose this revenue-recovery case and recommend exactly one playbook from the list above.',
    'Return ONLY the JSON object described in the system prompt. No markdown, no preamble.',
  );

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Main export — async Claude diagnosis with deterministic fallback
// ---------------------------------------------------------------------------

/**
 * Calls Claude for a real AI diagnosis and playbook recommendation.
 *
 * On success: returns an AIDecisionRecord with source='CLAUDE_AI' and all
 * AI-specific fields populated from the real model response.
 *
 * On failure (API error, timeout, invalid response, missing key, unsupported
 * playbook): falls back to createAIDecision() and sets aiFallbackUsed=true
 * with aiFallbackReason explaining why. The existing recovery workflow
 * continues unchanged.
 */
export async function getAIDecision(
  recCase: RecoveryCaseRecord,
  guardrails: GuardrailPolicy,
  customer?: CustomerRecord,
): Promise<AIDecisionRecord> {
  const apiKey = process.env.ANTHROPIC_API_KEY;

  // If API key is not configured, fall back immediately and silently
  if (!apiKey || apiKey.trim() === '') {
    const fallback = createAIDecision(recCase, guardrails, customer);
    return {
      ...fallback,
      aiFallbackUsed: true,
      aiFallbackReason: 'ANTHROPIC_API_KEY not configured',
    };
  }

  let rawText = '';

  try {
    const client = new Anthropic({ apiKey });

    const userMessage = buildCaseContext(recCase, guardrails, customer);

    const message = await client.messages.create({
      model: MODEL,
      max_tokens: 512,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userMessage }],
    });

    // Extract text content from the response
    const textBlock = message.content.find(block => block.type === 'text');
    if (!textBlock || textBlock.type !== 'text') {
      throw new Error('No text block in Claude response');
    }
    rawText = textBlock.text.trim();

    // Strip any accidental markdown code fences
    const jsonText = rawText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();

    // Parse and validate
    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonText);
    } catch {
      throw new Error(`Claude returned non-JSON output: ${rawText.slice(0, 200)}`);
    }

    if (!isValidClaudeResponse(parsed)) {
      throw new Error(
        `Claude response failed validation. recommendedPlaybook='${(parsed as Record<string, unknown>)?.recommendedPlaybook}' not in valid set or required fields missing.`,
      );
    }

    // Build the base deterministic decision (guardrails, candidate actions, etc.)
    // The deterministic engine remains authoritative for guardrail evaluation.
    const base = createAIDecision(recCase, guardrails, customer);

    // Override the diagnosis-layer fields with real Claude output.
    // Guardrail checks, escalation logic, and candidate actions remain
    // from the deterministic base — the model cannot change them.
    const aiRecord: AIDecisionRecord = {
      ...base,
      // AI diagnosis fields
      detectedIssue: parsed.rootCause,
      diagnosis: parsed.diagnosis,
      confidencePercent: Math.round(parsed.confidence * 100),
      confidence: parsed.confidence >= 0.75 ? 'HIGH' : parsed.confidence >= 0.5 ? 'MEDIUM' : 'LOW',
      // AI source metadata
      source: 'CLAUDE_AI',
      aiProvider: PROVIDER,
      aiModel: MODEL,
      aiRootCause: parsed.rootCause,
      aiReasoning: parsed.reasoning,
      aiRelevantSignals: parsed.relevantSignals,
      aiRawResponse: rawText,
      aiFallbackUsed: false,
      // If Claude recommends a different playbook than the seeded one and
      // it's valid, prefer Claude's recommendation for the trace evidence.
      // The deterministic guardrails still run on the actual recCase.playbook
      // so execution stays bounded.
      selectedPlaybook: base.escalationRequired
        ? 'HUMAN_ESCALATION'
        : (parsed.recommendedPlaybook as PlaybookType),
    };

    return aiRecord;
  } catch (err: unknown) {
    // Any failure — timeout, API error, invalid response, unsupported playbook —
    // falls back to the deterministic engine. Recovery continues uninterrupted.
    const reason = err instanceof Error ? err.message : String(err);
    const fallback = createAIDecision(recCase, guardrails, customer);
    return {
      ...fallback,
      aiFallbackUsed: true,
      aiFallbackReason: reason,
      aiRawResponse: rawText || undefined,
    };
  }
}
