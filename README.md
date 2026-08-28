# RecoverAI

**Find revenue that is slipping away and win it back.**

RecoverAI is an AI-assisted revenue-recovery platform. It detects seeded or
simulated revenue-risk cases, uses a real Claude LLM call to diagnose the
failure and recommend a recovery playbook, validates the recommendation
against a fixed playbook set, runs deterministic guardrail checks, executes
a bounded recovery action, and records verified recovery in a canonical ledger
with a full audit trail.

> **Architecture disclosure:** Case diagnosis and playbook recommendation use a
> real server-side call to the Claude API (Anthropic). Guardrail evaluation,
> execution authorization, settlement verification, and ledger writes are
> fully deterministic and cannot be influenced by the model. If the model
> call fails or returns invalid output the system falls back to the
> deterministic decision engine and continues operating without interruption.
> The default Razorpay adapter is a mock and does not move real money.

## Architecture

```
CASE DATA
   ↓
AI DIAGNOSIS + PLAYBOOK RECOMMENDATION   ← Claude API (server-side only)
   ↓
FIXED PLAYBOOK VALIDATION                ← model output validated against 7 known types
   ↓
DETERMINISTIC GUARDRAILS                 ← retry, cooldown, risk, value thresholds
   ↓
BOUNDED RECOVERY ACTION                  ← only allowed actions for the selected playbook
   ↓
SETTLEMENT VERIFICATION                  ← provider/mock response
   ↓
RECOVERY LEDGER                          ← canonical write-once entry
   ↓
AUDIT TRAIL                              ← append-only compliance record
```

The LLM is allowed to RECOMMEND. The deterministic engine remains responsible
for what the system is actually allowed to execute.

## What is implemented

The dashboard at `/dashboard` contains these existing views:

| View | Functionality |
|---|---|
| Overview / Command Center | At-risk value, verified recovered value, recovery rate, active cases, and recent activity. |
| Recovery Queue | Search and filter cases by playbook/status, open a case trace, and run a recovery workflow. |
| Playbook Analytics | Recovered versus at-risk values, category/playbook performance, and recovery trends from the same ledger-backed metrics. |
| Batch Simulator | Generate 1–100 synthetic cases, run the bounded pipeline, and show batch totals and case outcomes including AI-assisted vs deterministic fallback decision count. |
| Escalations | Review guardrail-triggered cases and approve or reject them. |
| Promise-to-Pay | Create commitments and test reminder, reschedule, kept, and broken states. Kept commitments write verified settlement state. |
| Guardrails | View and update retry, cooldown, risk, value, contact, and voice-policy settings for the session. |
| Audit | Inspect the append-only event trail by stage and case. |

## Recovery playbooks

The decision engine supports seven playbook types. The AI diagnoses the
failure context and recommends one of these. The deterministic engine
validates the recommendation and enforces guardrails.

| Playbook | Implemented prototype behavior |
|---|---|
| Payment Degradation | Gateway/failover-style recovery actions for failed payment context. |
| Checkout Abandonment | Resume-link, quick-pay, or settlement-incentive actions. |
| Failed Subscription | Payment-method update, authorization-link, or grace-period actions. |
| B2B Overdue Receivables | Payment link, early-payment incentive, or relationship-manager escalation. |
| Mandate Retry | Scheduled retry, split charge, or mandate-update action. |
| Hinglish Recovery | Bilingual outreach path with a clearly labelled simulated voice preview; no real call is placed. |
| Promise-to-Pay | Commitment tracking, reminders, rescheduling, kept settlement, and broken-promise escalation. |

## AI integration details

### Provider and model

- **Provider:** Anthropic
- **Model:** `claude-3-5-haiku-20241022`
- **Call location:** `src/lib/ai-claude.ts` — `getAIDecision()` function

### What the model receives

Each case request sends:

- Failure reason and payment state
- Amount at risk
- Customer segment and risk score
- Retry count and configured limits
- Historical customer recovery rate
- Available playbooks (fixed list, not open-ended)
- Current guardrail policy (for context only — model cannot modify it)

No personally identifiable information beyond what is already in the case
record is sent. The API key is read from `ANTHROPIC_API_KEY` server-side and
is never exposed to the client.

### What the model returns

A validated JSON object:

```json
{
  "diagnosis": "...",
  "rootCause": "...",
  "confidence": 0.0–1.0,
  "recommendedPlaybook": "<ONE OF THE 7 EXISTING PLAYBOOK TYPES>",
  "reasoning": "...",
  "relevantSignals": ["..."]
}
```

### Validation and safety

After receiving the model response:

1. JSON is parsed.
2. All required fields are validated.
3. `recommendedPlaybook` is checked against the exact set of 7 supported
   playbook types — any other value is rejected.
4. The recommendation feeds into the existing guardrail layer. Guardrails run
   independently and can block or escalate regardless of what the model says.

### Fallback behavior

If the model call fails (timeout, API error, invalid response, missing key,
unsupported playbook returned), the system falls back to the deterministic
decision engine. The fallback is recorded in:

- `AIDecisionRecord.aiFallbackUsed: true`
- `AIDecisionRecord.aiFallbackReason: "<reason>"`
- The Case Trace "AI Decision Evidence" section shows "Decision source: Deterministic fallback"
- The audit record uses `action: 'DECISION_FALLBACK'`

### Case Trace — AI Decision Evidence section

Every Case Trace shows an "AI Decision Evidence" panel with:

- Decision source: `● AI-ASSISTED` or `● DETERMINISTIC FALLBACK`
- Provider and model name
- AI root cause diagnosis
- Recommended playbook
- Model confidence
- Model reasoning
- Key case signals that influenced the recommendation
- Timestamp of the model call
- Collapsed raw model response (actual JSON from Claude, not fabricated)
- AI vs Guardrails boundary disclosure

## Recovery loop

```text
DETECT → AI DIAGNOSE → VALIDATE PLAYBOOK → CHECK GUARDRAILS → EXECUTE ACTION
→ VERIFY → WRITE LEDGER → STOP OR ESCALATE
```

Verified recoveries use one canonical settlement path. A recovered case has a
non-zero verified amount, settlement proof, one idempotent ledger record, and a
corresponding verification audit event.

## Technical architecture

- **Framework:** Next.js 16 App Router, React 19, TypeScript 5.
- **Styling and UI:** Tailwind CSS v4, dark visual theme, Framer Motion,
  GSAP, Three.js/OGL landing-page effects, Lucide icons, and Recharts.
- **Server state:** `DatabaseService`, an in-memory server-side singleton seeded
  from `data/seed/*.csv`.
- **AI layer:** `src/lib/ai-claude.ts` — server-side only Claude API call via
  `@anthropic-ai/sdk`. Falls back to `src/lib/ai-decision.ts` on any failure.
- **Decisioning:** `src/lib/ai-claude.ts` (AI) → `src/lib/ai-decision.ts`
  (deterministic fallback) → `src/lib/playbooks/engine.ts` (guardrails +
  execution). The AI layer is the diagnosis layer only.
- **Payments:** `RazorpayService`; mock mode is used when credentials are not
  configured.
- **Hosting:** Vercel. Current deployment:
  <https://ai-revenue-recovery-flame.vercel.app/>

## Local setup

Requirements: Node.js 20+ and npm 10+.

```bash
npm install
npm run dev
```

Set `ANTHROPIC_API_KEY` in `.env.local` for live AI diagnosis. Without it the
system runs with the deterministic fallback and clearly labels decisions as
such. Open <http://localhost:3000>.

Production validation commands:

```bash
npx tsc --noEmit
npm run build
npm run start
```

## API surface

| Method | Route | Purpose |
|---|---|---|
| GET | `/api/cases` | List/filter cases using `status`, `playbook`, and `search`. |
| GET | `/api/cases/:id` | Return a case and its audits. |
| POST | `/api/cases/:id/action` | Run the recovery pipeline (AI diagnosis → guardrails → action). |
| GET | `/api/cases/:id/decision` | Return or generate the AI/deterministic decision summary. |
| GET | `/api/cases/:id/trace` | Return case, audits, guardrails, AI decision, ledger, promise, and proof. |
| GET | `/api/metrics` | Return dashboard aggregates. |
| POST | `/api/simulate` | Run a synthetic batch with AI diagnosis per case; `batchSize` 1–100. |
| GET/POST | `/api/escalations` | List or approve/reject escalation records. |
| GET/POST | `/api/promises` | List or mutate promise-to-pay records. |
| GET | `/api/ledger` | Return ledger entries and verified totals. |
| GET | `/api/audit` | Return audit events with optional filters. |
| GET/POST | `/api/guardrails` | Read or update the in-memory guardrail policy. |
| DELETE | `/api/cases` | Reset runtime state to the CSV seed state. |
| GET | `/api/health` | Report application health. |

## Environment variables

| Variable | Required | Meaning |
|---|---|---|
| `ANTHROPIC_API_KEY` | Yes (for live AI) | Server-side Anthropic API key for Claude diagnosis. Never use `NEXT_PUBLIC_`. Falls back to deterministic engine if absent. |
| `RAZORPAY_KEY_ID` | No | Enables Razorpay test-mode configuration when paired with the secret. |
| `RAZORPAY_KEY_SECRET` | No | Razorpay test-mode secret; never expose it to client code. |
| `NEXT_PUBLIC_APP_URL` | No | Public URL used for generated links. |

The repository ignores `.env*`. Never commit real credentials.

## Security

- The Anthropic API key is read only from the server-side environment variable
  `ANTHROPIC_API_KEY`. It is never exposed to client code or logged.
- The model prompt contains case context but no raw API credentials.
- Raw model responses shown in the Case Trace are sanitized display only.
- No `NEXT_PUBLIC_` AI key exists anywhere in the codebase.

## Known limitations

- State is in memory and resets on restart or cold start.
- Seed data and Batch Simulator are the available detection sources; no live
  provider webhook route exists.
- The default provider integration is a mock; demo recoveries are not real
  payment captures.
- Hinglish is a simulated transcript/preview, not telephony.
- There is no authentication, authorization model, or role-based access control.
- INR is the assumed display and ledger currency.
- Guardrail settings persist only for the current server process.

## Problem-statement alignment

The prototype demonstrates a closed AI-assisted recovery loop: real LLM
diagnosis, bounded playbook selection from a fixed set, guardrail enforcement,
verified recovery, human escalation, Promise-to-Pay tracking, and audit
history.

See [`Documentation.md`](Documentation.md) for the feature inventory,
validation report, and prioritized gaps.
