# RecoverAI

**Find revenue that is slipping away and win it back.**

RecoverAI is a deterministic revenue-recovery prototype. It detects seeded or
simulated revenue-risk cases, diagnoses the recorded failure context, selects
one bounded playbook, evaluates guardrails, runs a mock/provider-backed action,
and records verified recovery in a canonical ledger with an audit trail.

> **Prototype disclosure:** Diagnosis and playbook ranking use a deterministic
> decision engine in this prototype. Guardrail checks are separately
> deterministic rule evaluation. No live model call is made per case in this
> build. The default Razorpay adapter is a mock and does not move real money.

## What is implemented

The dashboard at `/dashboard` contains these existing views:

| View | Functionality |
|---|---|
| Overview / Command Center | At-risk value, verified recovered value, recovery rate, active cases, and recent activity. |
| Recovery Queue | Search and filter cases by playbook/status, open a case trace, and run a recovery workflow. |
| Playbook Analytics | Recovered versus at-risk values, category/playbook performance, and recovery trends from the same ledger-backed metrics. |
| Batch Simulator | Generate 1–100 synthetic cases, run the bounded pipeline, and show batch totals and case outcomes. |
| Escalations | Review guardrail-triggered cases and approve or reject them. |
| Promise-to-Pay | Create commitments and test reminder, reschedule, kept, and broken states. Kept commitments write verified settlement state. |
| Guardrails | View and update retry, cooldown, risk, value, contact, and voice-policy settings for the session. |
| Audit | Inspect the append-only event trail by stage and case. |

## Recovery playbooks

The decision engine supports seven playbook types. The detected issue is the
root cause/context; the playbook is the bounded recovery channel or strategy.
The Case Trace shows both so the relationship is explicit.

| Playbook | Implemented prototype behavior |
|---|---|
| Payment Degradation | Gateway/failover-style recovery actions for failed payment context. |
| Checkout Abandonment | Resume-link, quick-pay, or settlement-incentive actions. |
| Failed Subscription | Payment-method update, authorization-link, or grace-period actions. |
| B2B Overdue Receivables | Payment link, early-payment incentive, or relationship-manager escalation. |
| Mandate Retry | Scheduled retry, split charge, or mandate-update action. |
| Hinglish Recovery | Bilingual outreach path with a clearly labelled simulated voice preview; no real call is placed. |
| Promise-to-Pay | Commitment tracking, reminders, rescheduling, kept settlement, and broken-promise escalation. |

## Recovery loop

```text
DETECT → DIAGNOSE → DECIDE PLAYBOOK → CHECK GUARDRAILS → EXECUTE ACTION
→ VERIFY → WRITE LEDGER → STOP OR ESCALATE
```

Verified recoveries use one canonical settlement path. A recovered case has a
non-zero verified amount, settlement proof, one idempotent ledger record, and a
corresponding verification audit event. Seeded recovered cases are hydrated
the same way, without duplicate ledger or settlement events on refresh.

Expected outcomes are not technical failures: `NOT_RECOVERED`, `ESCALATED`,
and `BLOCKED` represent business/guardrail outcomes. `FAILED` is reserved for
an unexpected execution or system failure.

## Architecture

- **Framework:** Next.js 16 App Router, React 19, TypeScript 5.
- **Styling and UI:** Tailwind CSS v4, existing dark visual theme, Framer Motion,
  GSAP, Three.js/OGL landing-page effects, Lucide icons, and Recharts.
- **Server state:** `DatabaseService`, an in-memory server-side singleton seeded
  from `data/seed/*.csv`.
- **Decisioning:** deterministic TypeScript logic in `src/lib/ai-decision.ts`
  and `src/lib/playbooks/engine.ts`; no LLM dependency.
- **Payments:** `RazorpayService`; mock mode is used when credentials are not
  configured. Test credentials can enable the adapter's test mode.
- **Hosting:** Vercel. Current deployment:
  <https://ai-revenue-recovery-flame.vercel.app/>

This is one Next.js application. There is no external database, Redis worker,
authentication layer, live webhook ingestion service, messaging provider, or
telephony system in this repository.

## Local setup

Requirements: Node.js 20+ and npm 10+.

```bash
npm install
npm run dev
```

Open <http://localhost:3000>. No external service is required for the demo.

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
| POST | `/api/cases/:id/action` | Run the recovery pipeline; accepts `forceApproval` for approved escalation execution. |
| GET | `/api/cases/:id/decision` | Return or persist the deterministic decision summary. |
| GET | `/api/cases/:id/trace` | Return case, audits, guardrails, decision factors, ledger, promise, and proof. |
| GET | `/api/metrics` | Return dashboard aggregates. |
| POST | `/api/simulate` | Run a synthetic batch; `batchSize` is clamped to 1–100. |
| GET/POST | `/api/escalations` | List or approve/reject escalation records. |
| GET/POST | `/api/promises` | List or mutate promise-to-pay records. |
| GET | `/api/ledger` | Return ledger entries and verified totals, optionally by `case_id`. |
| GET | `/api/audit` | Return audit events with optional `case_id`, `stage`, `limit`, and `offset`. |
| GET/POST | `/api/guardrails` | Read or update the in-memory guardrail policy. |
| DELETE | `/api/cases` | Reset runtime state to the CSV seed state. |
| GET | `/api/health` | Report application and Razorpay adapter health/mode. |

## Environment variables

| Variable | Required | Meaning |
|---|---|---|
| `RAZORPAY_KEY_ID` | No | Enables Razorpay test-mode configuration when paired with the secret. |
| `RAZORPAY_KEY_SECRET` | No | Razorpay test-mode secret; never expose it to client code. |
| `NEXT_PUBLIC_APP_URL` | No | Public URL used for generated links. |

The repository ignores `.env*`. Never commit real credentials.

## Known limitations

- State is in memory and resets on restart or cold start; it is not a durable production ledger.
- Seed data and Batch Simulator are the available detection sources; no live provider webhook route exists.
- The default provider integration is a mock, so demo recoveries are not real payment captures.
- Hinglish is a simulated transcript/preview, not telephony, speech recognition, or a completed phone call.
- There is no authentication, authorization model, or role-based access control.
- INR is the assumed display and ledger currency.
- Guardrail settings persist only for the current server process.
- No automated browser test suite is included; manual/API validation is documented below.

## Problem-statement alignment

The prototype demonstrates the requested closed loop and measured batch
recovery: detection from cases, deterministic diagnosis, bounded playbook
selection, guardrail enforcement, recovery outcomes, verified ledger totals,
human escalation, Promise-to-Pay tracking, and audit history.

It partially demonstrates “AI Revenue Recovery” rather than delivering a
production AI agent. The “AI” is product branding; runtime decisioning is
deterministic. The strongest judge-ready proof is the Batch Simulator plus a
Case Trace where queue amount, verified amount, ledger entry, audit event, and
aggregate metrics agree.

See [`Documentation.md`](Documentation.md) for the feature inventory,
validation report, usability review, and prioritized gaps.
