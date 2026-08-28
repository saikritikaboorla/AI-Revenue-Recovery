# RecoverAI Documentation and Validation Report

This document describes the implementation that is actually present in this
repository and records the final functionality review. It is intentionally
not a description of a future architecture.

## 1. Executive summary

RecoverAI is a visually polished Next.js prototype for demonstrating bounded
revenue-recovery workflows. It is strongest as a judge/demo artifact: the
Batch Simulator produces measurable outcomes, the Case Trace exposes the
decision and guardrail path, the ledger proves verified recovery, and the
Audit view makes the workflow inspectable.

It is not yet a production collections or payment platform. Runtime state is
an in-memory singleton, detection is seed/simulation based, provider actions
default to a mock adapter, and there is no authentication or live webhook
ingestion.

## 2. Feature inventory

### User-facing views

| View | Verified behavior |
|---|---|
| Landing page | Explains the loop, seven playbooks, bounded recovery, guardrails, and verified recovery value. |
| Overview / Command Center | Reads dashboard KPIs and recent recovery activity from the server database service. |
| Recovery Queue | Filters/searches cases, displays status and recovery value, and opens Case Trace or starts recovery. |
| Case Trace | Displays root issue, selected playbook, deterministic decision factors, guardrail checks, audit timeline, promise state, settlement proof, and ledger entries. Hinglish includes a `SIMULATED` voice preview. |
| Analytics | Displays charted recovery totals and playbook/category breakdowns from metrics. |
| Batch Simulator | Generates 1–100 cases, processes them through the pipeline, and reports recovered, escalated, failed, and at-risk values. |
| Escalations | Shows pending human approvals and supports approve/reject actions. |
| Promise-to-Pay | Supports create, reminder, reschedule, kept, and broken actions. Kept commitments settle through the canonical ledger path. |
| Guardrails | Supports current-session policy changes for retries, cooldowns, risk/value thresholds, contact limits, and voice policy. |
| Audit | Shows append-only pipeline events and outcome badges. |

### Implemented playbooks

The data model contains seven playbook types:

1. Payment Degradation
2. Checkout Abandonment
3. Failed Subscription
4. B2B Overdue Receivables
5. Mandate Retry
6. Hinglish Recovery
7. Promise-to-Pay

The detected issue represents the failure context/root cause. The selected
playbook represents the bounded intervention route. For example, a checkout
drop-off may be diagnosed as a customer abandoning the payment page and then
routed to a checkout resume-link playbook. Hinglish is a simulated bilingual
assist path, not a real call.

## 3. Actual workflow

```text
case signal → detect → diagnose → deterministic decision
→ playbook selection → guardrail evaluation → action
→ provider/mock response → verification → canonical ledger + audit
→ recovered, not recovered, stopped, or escalated
```

Decisioning is implemented in TypeScript. It uses case attributes such as
failure reason, customer segment, risk, retry count, amount, and guardrail
state. It does not call an LLM.

### Settlement consistency

`DatabaseService` is the source of truth for cases, ledger entries, audits,
escalations, promises, and guardrails. Recovered seed cases are hydrated into
the canonical settlement path before audit classification. The hydration is
idempotent: an existing case ledger is reused, and a missing recovered ledger
is created once with a case-specific idempotency key. Metrics, queue, Case
Trace, ledger, audit, and analytics therefore read the same verified amount.

The original synchronization defect was that a case could be seeded with
`RECOVERED` status or a recovered amount while its verification/ledger record
was missing. The queue used the case-level signal, while Case Trace used the
ledger-level signal. The fix creates the missing settlement evidence during
seed/runtime normalization and avoids duplicate entries on hydration, refresh,
reopen, or re-render.

## 4. Guardrails and outcomes

Guardrails evaluate retry headroom, cooldown, customer contact policy, risk,
and high-value thresholds. A breached policy creates or maintains an
escalation and prevents autonomous execution unless a human approves it.

Expected business outcomes are distinct from technical failures:

| Situation | Correct result |
|---|---|
| Verification does not produce a settlement | `NOT_RECOVERED` |
| A guardrail stops autonomous action | `ESCALATED` |
| A human rejects an escalation | `BLOCKED` / stopped case |
| Unexpected exception or provider/API failure | `FAILED` |

Retry display is clamped/formatted so it does not present an impossible ratio
such as `4/3`; an exceeded limit is represented as a limit-exceeded state.

## 5. Hinglish disclosure

The Case Trace contains `SIMULATED VOICE PREVIEW` / `PREVIEW · NOT LIVE
TELEPHONY`, with a short Agent/Customer transcript. The app does not claim a
phone call occurred and does not include telephony, speech recognition, or a
live voice provider.

## 6. API and data architecture

The API is implemented as Next.js route handlers under `src/app/api/`.

| Area | Routes |
|---|---|
| Cases and trace | `/api/cases`, `/api/cases/:id`, `/api/cases/:id/action`, `/api/cases/:id/decision`, `/api/cases/:id/trace` |
| Measurement | `/api/metrics`, `/api/ledger` |
| Simulation | `/api/simulate` |
| Controls | `/api/escalations`, `/api/promises`, `/api/guardrails` |
| Observability | `/api/audit`, `/api/health` |

The CSV seed data lives in `data/seed/`. The server-side in-memory maps hold
customers, cases, ledger entries, audits, escalations, promises, and policy.
`DELETE /api/cases` restores the verified seed state.

## 7. Environment and security

Optional Razorpay test credentials are read server-side from
`RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET`. No client-side secret exposure was
found. `.env*` is ignored by Git. The repository has no live LLM key,
telephony key, or database credential requirement.

This remains unsuitable for real customer/payment data until authentication,
authorization, tenant isolation, durable storage, secret management, webhook
verification, provider idempotency, monitoring, and compliance review are
added.

## 8. Validation report

The following checks were performed against the implemented app and the live
deployment at <https://ai-revenue-recovery-flame.vercel.app/>:

- Fresh simulator batch: recovered cases had `status = RECOVERED`, non-zero
  verified amount, an exact queue/trace amount match, one ledger entry, and
  settlement proof. Unrecovered cases had zero verified amount, zero ledger
  entries, and no settlement proof.
- Recovered-case synchronization: three pre-recovered simulator cases were
  opened from the queue and matched across Case Trace, ledger, audit, and
  aggregate recovery totals. The exact IDs are synthetic and change on each
  batch; retain the batch output when reproducing the test.
- Escalation semantics: expected escalation stages returned `ESCALATED`, not
  `FAILED`; a tested trace showed `Retry limit=PASS:0/2`.
- Reset: `DELETE /api/cases` removed simulator cases and derived totals, then a
  fresh batch rebuilt the runtime state.
- Empty/error paths: missing case requests return 404; simulator and panel
  requests show retryable error states; empty escalations and promises show
  resolved empty states; Promise-to-Pay has a resolving skeleton.
- Build: `npm run build` passed.
- TypeScript: `npx tsc --noEmit` passes when run after the build has finished
  generating `.next/types` (running both concurrently can cause a transient
  missing-generated-file error).
- Production health: live `/api/health` reported healthy and the deterministic
  service identity.
- Metadata: title, Open Graph title/description, Open Graph preview image, and
  favicon are present.
- Console hygiene: no `console.log` or `console.debug` calls were found;
  remaining `console.error` calls are error-handler diagnostics.

## 9. Review against the problem statement

| Requirement | Assessment |
|---|---|
| Detect revenue at risk | **Demonstrated in prototype scope.** Seeded cases and synthetic batches cover payment failure, checkout abandonment, failed subscription, mandate retry, B2B overdue receivables, Hinglish, and Promise-to-Pay. No live webhook ingestion is implemented. |
| Determine the right intervention | **Demonstrated.** Deterministic diagnosis and bounded playbook selection are visible in Case Trace. |
| Execute a bounded recovery workflow | **Demonstrated.** Guardrails, allowed playbook actions, escalation, verification, ledger write, and audit trail are implemented. |
| Payment degradation | **Demonstrated as a mock/simulated provider workflow.** |
| Checkout drop-off | **Demonstrated as a bounded simulated action.** |
| Failed subscription | **Demonstrated as a bounded simulated action.** |
| B2B receivables | **Demonstrated with escalation and promise-oriented actions.** |
| Mandate retry | **Demonstrated as a bounded retry/reschedule path.** |
| Hinglish voice recovery | **Partially demonstrated.** Static simulated preview only; no real voice call. |
| Promise-to-pay tracker | **Demonstrated.** Status actions and broken-promise escalation are present. |
| Measured money recovered across a batch | **Strongly demonstrated for the prototype.** Verified amounts are ledger-backed and visible in batch, queue, trace, analytics, and audit surfaces. |
| Compliant escalation/stopping rules | **Demonstrated as configurable prototype policy.** It is not a compliance certification. |

Overall alignment: **strong for a deterministic hackathon prototype, partial
for the literal “AI agent” and production integration requirements.**

## 10. Honest product review

### Strengths

- The strongest differentiator is the closed-loop proof: a case can be traced
  from risk signal to decision, guardrail result, verification, ledger entry,
  and aggregate recovery value.
- The dark dashboard, animated landing page, clear status colors, charts, and
  Case Trace create a credible control-tower presentation. This is the
  product's current “wow factor.”
- Human approval, Promise-to-Pay state changes, reset hygiene, and audit events
  make the demo more complete than a simple classifier or queue.
- The deterministic disclosure is honest and improves judge trust.

### Bad sides and risks

- “AI” remains branding rather than runtime intelligence. The app should not
  be judged as an LLM-powered agent without adding a real model call and a
  safe structured-output boundary.
- In-memory state is not durable or horizontally safe. Vercel cold starts and
  multiple instances can diverge or reset data.
- There is no authentication, authorization, tenant isolation, or operator
  identity enforcement, so the approval and guardrail controls are demo-only.
- Mock payment and messaging actions do not prove that money was recovered in
  a real provider account.
- There is no live event ingestion, scheduled retry worker, webhook signature
  verification, or durable job queue.
- Some domain labels are dense and the dashboard has many surfaces. A first-
  time user still needs the Case Trace to understand what actually happened.
- Manual browser coverage is limited; there is no automated end-to-end suite.

### UI, clarity, and backend verdict

- **UI:** Good and judge-ready, with a coherent existing visual identity. It is
  information-dense but not fundamentally confusing.
- **Wow factor:** Yes, primarily from the animated control-tower feel and
  evidence chain. The wow factor would be stronger with real provider events,
  but those should not be faked.
- **Backend:** Functionally coherent for a single-process demo and now
  consistent for recovered settlement state. Not production-ready because
  persistence, auth, webhook ingestion, and multi-instance safety are absent.
- **Clean/easy to understand:** Clean enough for a demo. The honest disclosure,
  queue-to-trace path, and audit trail provide the necessary explanation, but
  the density of playbooks and metrics rewards a guided walkthrough.

## 11. Recommended next steps

1. Add a durable database and transactional, unique settlement constraint.
2. Add authenticated roles for operators, approvers, and policy editors.
3. Add verified provider webhooks and a durable retry/job system.
4. Add automated browser tests for queue → trace → action → ledger → audit and
   reset behavior.
5. Only then consider a real model-assisted diagnosis path, with deterministic
   guardrails and schema validation remaining outside the model.
