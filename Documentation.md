# RecoverAI Documentation and Validation Report

This document describes the implementation that is actually present in this
repository and records the final functionality review. It is intentionally
not a description of a future architecture.

## 1. Executive summary

RecoverAI is a Next.js prototype for demonstrating bounded AI-assisted
revenue-recovery workflows. It uses a real server-side Google Gemini LLM call for
case diagnosis and playbook recommendation, followed by fully deterministic
guardrail evaluation and bounded recovery execution. The Batch Simulator
produces measurable outcomes, the Case Trace exposes the AI decision and
guardrail path with actual model output, and the Audit view makes the
workflow inspectable.

It is not yet a production collections or payment platform. Runtime state is
an in-process cache backed by a private shared runtime document in production,
detection is seed/simulation based, provider actions
default to a mock adapter, and there is no authentication or live webhook
ingestion.

## 2. Feature inventory

### User-facing views

| View | Verified behavior |
|---|---|
| Landing page | Explains the loop, seven playbooks, bounded recovery, guardrails, and verified recovery value. |
| Overview / Command Center | Reads dashboard KPIs and recent recovery activity from the server database service. |
| Recovery Queue | Filters/searches cases, displays status and recovery value, and opens Case Trace or starts recovery. |
| Case Trace | Displays an "AI Decision Evidence" panel with real Gemini model output (root cause, recommended playbook, reasoning, key signals, raw response). Shows GEMINI or DETERMINISTIC FALLBACK label. Guardrails, settlement proof, and ledger entries are separately deterministic. Hinglish includes a `SIMULATED` voice preview. |
| Analytics | Displays charted recovery totals and playbook/category breakdowns from metrics. |
| Batch Simulator | Generates 1–100 cases, processes them through the AI + pipeline, and reports recovered, escalated, failed, at-risk values, plus AI-assisted vs deterministic fallback decision counts. |
| Escalations | Shows pending human approvals and supports approve/reject actions. |
| Promise-to-Pay | Supports create, reminder, reschedule, kept, and broken actions. Kept commitments settle through the canonical ledger path. |
| Guardrails | Supports current-session policy changes for retries, cooldowns, risk/value thresholds, contact limits, and voice policy. |
| Audit | Shows append-only pipeline events and outcome badges. AI decisions are recorded with `GEMINI_DIAGNOSIS_ENGINE` actor. |

### Implemented playbooks

The data model contains seven playbook types:

1. Payment Degradation
2. Checkout Abandonment
3. Failed Subscription
4. B2B Overdue Receivables
5. Mandate Retry
6. Hinglish Recovery
7. Promise-to-Pay

The Gemini model receives these 7 playbook types in its prompt and must
recommend exactly one. The model cannot invent new playbooks or actions.

## 3. Actual workflow

```text
case signal
→ detect
→ AI diagnosis (Gemini API, server-side)
  → validate recommended playbook against 7 known types
  → on failure: deterministic fallback
→ deterministic guardrail evaluation (retry, risk, amount, cooldown)
  → pass: execute bounded playbook action
  → block: escalate to human
→ provider/mock response
→ settlement verification
→ canonical ledger + audit
→ recovered, not recovered, stopped, or escalated
```

### AI call details

- **Function:** `getAIDecision()` in `src/lib/ai-gemini.ts`
- **SDK:** `@google/genai`
- **Model:** `GEMINI_MODEL` (default `gemini-3.6-flash`) through Google Gemini
  and `@google/genai`.
- **Transport:** Gemini API — server-side only
- **Key:** `GEMINI_API_KEY` environment variable — never client-side
- **Input:** case failure reason, amount, segment, risk score, retry count,
  historical recovery rate, guardrail policy (context only), full list of
  7 playbook types
- **Output:** `{ diagnosis, rootCause, confidence, recommendedPlaybook, reasoning, relevantSignals }`
- **Validation:** JSON parse + all field checks + `recommendedPlaybook` must
  be one of the 7 fixed types

### Fallback

If the Gemini call fails for any reason (missing key, timeout, API error,
malformed JSON, unsupported playbook), `getAIDecision()` catches the error,
calls `createAIDecision()` (deterministic), sets `aiFallbackUsed: true` and
`aiFallbackReason`, and returns normally. The pipeline is never interrupted.

### Settlement consistency

`DatabaseService` is the source of truth for cases, ledger entries, audits,
escalations, promises, and guardrails. Recovered seed cases are hydrated into
the canonical settlement path before audit classification. The hydration is
idempotent.

## 4. Guardrails and outcomes

Guardrails evaluate retry headroom, cooldown, customer contact policy, risk,
and high-value thresholds. A breached policy creates or maintains an
escalation and prevents autonomous execution unless a human approves it.

The AI model receives guardrail policy as read-only context. It cannot change
thresholds, retry limits, cooldowns, or any guardrail setting.

Expected business outcomes:

| Situation | Correct result |
|---|---|
| Verification does not produce a settlement | `NOT_RECOVERED` |
| A guardrail stops autonomous action | `ESCALATED` |
| A human rejects an escalation | `BLOCKED` / stopped case |
| LLM call fails | Deterministic fallback, `aiFallbackUsed: true` |
| Unexpected exception | `FAILED` |

## 4a. Playbook verification map

All seven UI playbooks are defined once in `src/lib/playbooks/index.ts` as
`PLAYBOOK_CONFIGS`. Selection is performed by the validated Gemini result or
`createAIDecision()` in `src/lib/ai-decision.ts`; execution is shared by
`RecoveryPipeline.processCase()` in `src/lib/playbooks/engine.ts`. The pipeline
checks merchant policy and deterministic guardrails, executes only the selected
config's `allowedActions`, calls `DatabaseService.settleCase()` for verified
settlement, and records case, ledger, and audit state in `src/lib/db/index.ts`.

| Playbook | Selection signal | Bounded actions |
|---|---|---|
| Payment Degradation | Gateway timeout, bank downtime, network decline | Gateway/UPI/card failover |
| Checkout Abandonment | Expired checkout or payment-page drop-off | Resume link, incentive, quick-pay |
| Failed Subscription | Mandate, authentication, balance, or renewal failure | Method update, AFA link, grace period |
| B2B Overdue Receivables | Overdue invoice, AP, PO, or dispute signal | Payment link, early discount, relationship escalation |
| Mandate Retry | Paused mandate, insufficient funds, clearing/salary timing | Morning retry, split charge, mandate update |
| Hinglish Recovery | Regional UPI confusion, payment help, discount query, dropped-call assist | Hinglish prompt, assisted IVR preview, UPI QR |
| Promise-to-Pay | Deferred payment, installment, or broken-promise signal | Create commitment, reminder, breach escalation |

Successful verification writes one idempotent ledger entry and a
`SETTLEMENT_VERIFIED_AND_LEDGER_WRITTEN` audit event. Failed verification writes
no recovered amount. Case Trace and decision reads cache decision evidence but
do not create workflow events, so opening a completed case cannot append a late
`DECIDE_PLAYBOOK` record after `VERIFY` or `RECOVERED`.

## 5. AI Decision Evidence — Case Trace

Every processed case trace shows an "AI Decision Evidence" panel:

- **● GEMINI** badge when a real Gemini call succeeded
- **● DETERMINISTIC FALLBACK** badge when Gemini failed and the fallback ran
- Provider: Google Gemini
- Model: `GEMINI_MODEL` (default `gemini-3.6-flash`)
- Root cause (from model)
- Recommended playbook (validated against 7 fixed types)
- Confidence (model-returned 0.0–1.0)
- Reasoning (model text, specific to the case)
- Key signals (model-returned array)
- Timestamp of the model call
- Raw model response (collapsed, actual JSON from Gemini)
- AI vs Guardrails boundary notice

## 6. Hinglish disclosure

The Case Trace contains `SIMULATED VOICE PREVIEW` / `PREVIEW · NOT LIVE
TELEPHONY`, with a short Agent/Customer transcript. The app does not claim a
phone call occurred and does not include telephony, speech recognition, or a
live voice provider.

## 7. API and data architecture

The API is implemented as Next.js route handlers under `src/app/api/`.

| Area | Routes |
|---|---|
| Cases and trace | `/api/cases`, `/api/cases/:id`, `/api/cases/:id/action`, `/api/cases/:id/decision`, `/api/cases/:id/trace` |
| Measurement | `/api/metrics`, `/api/ledger` |
| Simulation | `/api/simulate` |
| Controls | `/api/escalations`, `/api/promises`, `/api/guardrails` |
| Observability | `/api/audit`, `/api/health` |

The CSV seed data lives in `data/seed/`. `DatabaseService` is the one source
of truth for customers, cases, ledger entries, audits, escalations, promises,
and policy. Development uses the runtime JSON file; production hydrates and
flushes the same repository to one private Vercel Blob JSON document. This
keeps simulator cases available when Queue and Trace requests reach different
serverless instances. `DELETE /api/cases` restores the verified seed state.

Production reads bypass the Blob CDN cache for canonical state, and durable
writes are serialized within each warm runtime before merging the latest shared
snapshot. This prevents ordinary cache/cold-start races from presenting stale
Audit, Queue, Trace, Ledger, or Escalation data. Cross-region transactional
storage remains a prototype limitation.

## 8. Environment and security

`GEMINI_API_KEY` is read server-side only from the environment variable.
It is never set as `NEXT_PUBLIC_*`, never logged, and never sent to the
browser. The model prompt contains case context but no API credentials.

Optional Razorpay test credentials are read server-side from
`RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET`. `.env*` is ignored by Git.

This remains unsuitable for real customer/payment data until authentication,
authorization, tenant isolation, durable storage, secret management, webhook
verification, provider idempotency, monitoring, and compliance review are
added.

## 9. Validation report

The following checks were performed against the implemented app:

- TypeScript check (`npx tsc --noEmit`): zero errors.
- Production build (`npm run build`): clean, all 15 routes compiled.
- Fresh simulator batch: recovered cases had `status = RECOVERED`, non-zero
  verified amount, one ledger entry, and settlement proof. Unrecovered cases
  had zero verified amount and no ledger entries.
- AI source tracking: batch results report `aiAssistedCount` (real Gemini
  calls) and `fallbackCount` (deterministic fallback) derived from the actual
  `ai_decision.source` and `aiFallbackUsed` fields per case.
- Escalation semantics: guardrail-blocked cases produce `ESCALATED` audit
  events with `GUARDRAIL_COMPLIANCE_MONITOR` actor.
- Reset: `DELETE /api/cases` removes simulator cases and derived totals.
- Security: no `NEXT_PUBLIC_` AI key exists; API key is server-side only.
- Live validation: production returned all operational APIs, Audit returned the
  complete requested event snapshot, approval reused a persisted decision, and
  duplicate approval was idempotent.

## 10. Review against the problem statement

| Requirement | Assessment |
|---|---|
| Detect revenue at risk | **Demonstrated in prototype scope.** Seeded cases and synthetic batches cover all 7 playbook types. No live webhook ingestion. |
| Determine the right intervention | **Demonstrated with real AI.** Gemini diagnoses each case and recommends a playbook. The deterministic engine validates and enforces guardrails. |
| Execute a bounded recovery workflow | **Demonstrated.** Guardrails, allowed playbook actions, escalation, verification, ledger write, and audit trail are implemented. |
| AI-assisted diagnosis | **Implemented.** Real Gemini API call in `src/lib/ai-gemini.ts`. Validated structured output. Deterministic fallback if Gemini fails. |
| Payment degradation | **Demonstrated as a mock/simulated provider workflow.** |
| Checkout drop-off | **Demonstrated as a bounded simulated action.** |
| Failed subscription | **Demonstrated as a bounded simulated action.** |
| B2B receivables | **Demonstrated with escalation and promise-oriented actions.** |
| Mandate retry | **Demonstrated as a bounded retry/reschedule path.** |
| Hinglish voice recovery | **Partially demonstrated.** Case-dependent simulated Voice/WhatsApp preview only; no real voice call or WhatsApp message. Consent, opt-out/DND, and merchant communication policy are deterministic gates. |
| Promise-to-pay tracker | **Demonstrated.** Status actions and broken-promise escalation are present. |
| Measured money recovered across a batch | **Strongly demonstrated.** Verified amounts are ledger-backed and visible in batch, queue, trace, analytics, and audit surfaces. |
| Compliant escalation/stopping rules | **Demonstrated as configurable prototype policy.** |

Overall alignment: **strong for an AI-assisted hackathon prototype** with real
LLM diagnosis, bounded execution, deterministic guardrails, and verified
recovery evidence.

## 11. Known gaps and next steps

1. Add a durable database and transactional, unique settlement constraint.
2. Add authenticated roles for operators, approvers, and policy editors.
3. Add verified provider webhooks and a durable retry/job system.
4. Add automated browser tests for queue → trace → action → ledger → audit.
5. Consider streaming AI responses for large batches to reduce latency.
