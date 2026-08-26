# AI Revenue Recovery

**Find revenue that's slipping away — and win it back, automatically.**

AI Revenue Recovery is an agentic system that watches your payment, checkout, and
receivables data in real time, figures out *why* money is at risk, decides the
right way to intervene, and runs a bounded recovery workflow — with a full audit
trail of every action it took and every dollar it recovered.

> **Status:** Prototype / Hackathon build. Not production-hardened. See
> [Known Limitations](#known-limitations) before connecting real payment data.

---

## Table of Contents

1. [What This Actually Does](#what-this-actually-does)
2. [Why This Exists](#why-this-exists)
3. [How It Works (The Loop)](#how-it-works-the-loop)
4. [Recovery Playbooks](#recovery-playbooks)
5. [Tech Stack](#tech-stack)
6. [Architecture](#architecture)
7. [Project Structure](#project-structure)
8. [Getting Started](#getting-started)
9. [CLI Reference](#cli-reference)
10. [Environment Variables](#environment-variables)
11. [Data Model & Audit Trail](#data-model--audit-trail)
12. [Guardrails, Stopping Rules & Compliance](#guardrails-stopping-rules--compliance)
13. [Metrics Dashboard](#metrics-dashboard)
14. [Known Limitations](#known-limitations)
15. [Roadmap](#roadmap)

---

## What This Actually Does

In plain terms: this is a website + background agent that sits on top of your
payments stack (Stripe/Razorpay-style events, checkout sessions, and invoices)
and does three jobs a human revenue-ops team would otherwise do manually:

1. **Detects** revenue at risk — a card decline, an abandoned checkout, a
   subscription that failed to renew, an invoice going overdue.
2. **Diagnoses** the root cause — insufficient funds vs. expired card vs.
   bank-side decline vs. a UX drop-off vs. a customer who's just late.
3. **Recovers** the money — by picking one intervention from a small, bounded
   set of allowed actions (retry payment, send a reminder, offer a grace
   period, escalate to a human), executing it, and logging exactly what
   happened so it can be reviewed later.

The web app is the control tower: a live feed of at-risk revenue, the agent's
reasoning for each case, the action it took, and a running total of money
recovered across a batch — plus a manual override/approve button for anything
above a configurable risk threshold.

---

## Why This Exists

Revenue leakage is rarely one clean failure — it's a chain: a payment
degrades → the customer abandons checkout → the subscription silently lapses
→ the invoice goes overdue → nobody follows up in time. Today that chain is
handled by disconnected tools and manual chasing. This prototype closes the
loop end-to-end: **detect → diagnose → decide → act → verify**, instead of
just alerting a human and hoping they act on it.

---

## How It Works (The Loop)

```
   ┌─────────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
   │   DETECT    │ --> │   DIAGNOSE  │ --> │   DECIDE    │ --> │     ACT     │ --> │   VERIFY    │
   └─────────────┘     └─────────────┘     └─────────────┘     └─────────────┘     └─────────────┘
   Webhook / poll       Root-cause          Pick one action     Execute via         Confirm payment
   catches a signal:    classification:     from the allowed    provider API /      cleared, log
   failed charge,       card vs. bank vs.   playbook set,       messaging channel   outcome, update
   abandoned cart,      UX vs. fraud vs.    respecting risk     (retry, email,      recovered-$
   overdue invoice,     "customer is        limits + stopping   SMS/WhatsApp,       counter, close
   failed mandate       just late"          rules               call, escalate)     or retry loop
```

Every case that enters the loop gets a unique `case_id` and every step above
is written to the audit log (see [Data Model](#data-model--audit-trail)) — so
nothing the agent does is a black box.

---

## Recovery Playbooks

These are the intervention modules included in the prototype. Each is a
self-contained "if this kind of revenue risk, then this bounded set of
actions" playbook — the agent picks *one* playbook per case, never invents
a new action outside it.

| Playbook | Trigger | Typical Actions |
|---|---|---|
| **Payment Degradation → Root Cause → Recovery** | Card decline / failed charge | Classify decline reason → smart retry with backoff, or prompt for updated card |
| **Checkout Drop-off Recovery** | Cart/checkout session abandoned | Timed nudge (email/SMS), optional incentive, one-click resume link |
| **Failed-Subscription Recovery** | Recurring billing failure | Dunning sequence (retry schedule), update-payment-method link, grace period |
| **B2B Receivables Chaser** | Invoice past due date | Staged reminders (polite → firm), escalation to AR team past N days |
| **Mandate Retry Sequencer** | Failed autopay/eNACH/UPI mandate | Retry within network-allowed windows, fallback to manual payment link |
| **Hinglish Voice Recovery** | High-value case, no response to text | AI voice call in Hinglish for reminder/payment link, human handoff on request |
| **Promise-to-Pay Tracker** | Customer commits to a pay date | Track commitment, auto-follow-up if date passes, mark broken promise for escalation |

---

## Tech Stack

> **Assumption flagged:** no existing codebase was found in this environment,
> so the stack below is a recommended, hackathon-appropriate default. Replace
> this table with your actual stack if it differs — the rest of the doc
> structure still applies.

| Layer | Choice | Why |
|---|---|---|
| Frontend | **Next.js (React + TypeScript)**, Tailwind CSS | Fast to build a dashboard + live feed UI; SSR for the control-tower view |
| Backend API | **Next.js API routes** or a small **Node.js (Express)** service | Webhook ingestion (Stripe/Razorpay), REST endpoints for the dashboard |
| Agent / Orchestration | **Python** worker service using the **Claude API** (tool use / function calling) | Diagnosis + decision step; Claude picks a playbook and returns a structured action, not free-form text |
| Task Queue | **Redis + BullMQ** (or Celery if Python-first) | Retry scheduling, dunning sequences, delayed follow-ups |
| Database | **PostgreSQL** | Cases, audit log, recovered-revenue ledger, promise-to-pay records |
| Payments | **Stripe** (or Razorpay for India-first flows) webhooks + API | Source of truth for charges, subscriptions, invoices; also used to *execute* retries |
| Messaging | **Twilio** (SMS/WhatsApp/Voice) or **WhatsApp Business API** | Checkout nudges, dunning messages, Hinglish voice calls |
| Auth | **NextAuth.js** or **Clerk** | Dashboard login for the ops team reviewing/approving actions |
| Hosting | **Vercel** (frontend) + **Railway/Render/Fly.io** (worker + Postgres + Redis) | Fastest path for a prototype deploy |
| Observability | Structured logs to Postgres + optional **Sentry** | Every agent decision is queryable, not just "printed to console" |

**Why an agent framework isn't listed separately:** the "agent" here is
intentionally a *constrained* decision function — Claude is given the case
data and a fixed menu of allowed tools/actions (retry_payment, send_reminder,
offer_grace_period, escalate_to_human, etc.) via function calling, and must
pick from that menu. This keeps the system auditable and bounded rather than
letting the model free-form its way to arbitrary side effects.

---

## Architecture

```
                              ┌────────────────────────┐
                              │   Payment Provider      │
                              │  (Stripe / Razorpay)    │
                              └───────────┬─────────────┘
                                          │ webhooks (charge.failed,
                                          │ invoice.overdue, checkout.abandoned)
                                          ▼
   ┌───────────────┐   enqueue   ┌───────────────────┐   reads/writes   ┌───────────────┐
   │  Ingestion API │ ─────────> │   Redis Queue      │ ───────────────>│  PostgreSQL    │
   │ (Next.js route)│            │  (BullMQ jobs)     │                  │  (cases, audit,│
   └───────────────┘            └─────────┬───────────┘                  │   ledger)      │
                                            │                              └───────┬───────┘
                                            ▼                                      │
                                  ┌───────────────────┐   structured action        │
                                  │  Agent Worker       │ ──────────────────────────┘
                                  │  (Python + Claude   │
                                  │   function calling) │
                                  └─────────┬───────────┘
                                            │ executes via allowed tools only
                          ┌─────────────────┼─────────────────┐
                          ▼                 ▼                 ▼
                 ┌────────────────┐ ┌───────────────┐ ┌────────────────┐
                 │ Payment Retry   │ │ Twilio SMS /   │ │ Escalate to     │
                 │ (Stripe API)    │ │ WhatsApp / Call│ │ Human (dashboard)│
                 └────────────────┘ └───────────────┘ └────────────────┘
                                            │
                                            ▼
                                  ┌───────────────────┐
                                  │  Dashboard (Next.js)│
                                  │  live feed, audit    │
                                  │  trail, $ recovered  │
                                  └───────────────────┘
```

---

## Project Structure

```
ai-revenue-recovery/
├── apps/
│   ├── web/                  # Next.js dashboard + API routes (ingestion, auth)
│   │   ├── app/
│   │   ├── components/
│   │   └── lib/
│   └── worker/                # Python agent worker
│       ├── agent/
│       │   ├── detect.py
│       │   ├── diagnose.py
│       │   ├── decide.py       # Claude function-calling decision step
│       │   ├── playbooks/      # one file per playbook in the table above
│       │   └── act.py
│       ├── tools/              # allowed-action implementations (retry, sms, etc.)
│       └── queue_consumer.py
├── packages/
│   └── db/                    # Postgres schema + migrations (shared types)
├── infra/
│   └── docker-compose.yml     # local Postgres + Redis for dev
├── .env.example
└── README.md                  # this file
```

---

## Getting Started

### Prerequisites

- Node.js 20+
- Python 3.11+
- Docker (for local Postgres + Redis)
- A Stripe test account (or Razorpay test account)
- An Anthropic API key
- (Optional) Twilio account for SMS/WhatsApp/voice playbooks

### Setup (CLI)

```bash
# 1. Clone and enter the repo
git clone <your-repo-url> ai-revenue-recovery
cd ai-revenue-recovery

# 2. Copy env template and fill in secrets
cp .env.example .env

# 3. Start local infra (Postgres + Redis)
docker compose -f infra/docker-compose.yml up -d

# 4. Install frontend deps and run the dashboard
cd apps/web
npm install
npm run db:migrate      # applies Postgres schema
npm run dev             # dashboard at http://localhost:3000

# 5. In a second terminal, install and run the agent worker
cd apps/worker
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
python queue_consumer.py

# 6. In a third terminal, forward Stripe webhooks to your local ingestion API
stripe listen --forward-to localhost:3000/api/webhooks/stripe
```

Once all three are running: trigger a test failed payment from the Stripe
CLI (`stripe trigger charge.failed`) and watch it appear in the dashboard's
live feed within a few seconds, move through Detect → Diagnose → Decide →
Act → Verify, and land in the audit log.

---

## CLI Reference

The worker also exposes a small CLI for running things without the UI —
useful for demos, batch tests, and judging.

```bash
# Run a single case through the full loop manually (for demoing)
python -m worker.cli run-case --case-id <id>

# Replay a batch of synthetic failed payments / abandoned checkouts
python -m worker.cli seed-batch --count 50 --type failed_payment

# Print the recovery report for a batch (money recovered, win rate, per-playbook breakdown)
python -m worker.cli report --batch-id <id>

# Dry-run mode: agent decides but does NOT execute any action (safe for demos)
python -m worker.cli run-case --case-id <id> --dry-run

# Tail the audit log for a case in the terminal
python -m worker.cli audit --case-id <id> --follow
```

---

## Environment Variables

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Postgres connection string |
| `REDIS_URL` | Redis connection string for the job queue |
| `ANTHROPIC_API_KEY` | Powers the diagnose/decide step |
| `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` | Payment events + retry execution |
| `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` | SMS / WhatsApp / voice playbooks |
| `NEXTAUTH_SECRET` | Dashboard auth |
| `MAX_AUTO_ACTION_RISK_SCORE` | Cases above this score require human approval instead of auto-execution |
| `DRY_RUN` | If `true`, agent decides but never calls a real provider action |

See `.env.example` in the repo root for the full list with sample values.

---

## Data Model & Audit Trail

Every case is tracked end-to-end so results are verifiable, not just claimed.

**`cases`** — one row per at-risk-revenue event (payment failure, abandoned
checkout, overdue invoice, failed mandate). Tracks status
(`detected → diagnosing → decided → acting → recovered/failed/escalated`).

**`audit_log`** — append-only. One row per step the agent takes on a case:
what signal triggered it, what root cause it inferred, what playbook and
action it chose, what it actually executed, the provider's response, and the
outcome. This is what makes the system reviewable after the fact — anyone
can reconstruct exactly why the agent did what it did for any case.

**`recovery_ledger`** — one row per dollar (or ₹) recovered, linked back to
its case, so the "money recovered" number shown on the dashboard is always
traceable to real, verified provider confirmations — not an estimate.

**`promises`** — for the promise-to-pay playbook: customer, committed date,
amount, whether it was kept, and the follow-up action if it wasn't.

---

## Guardrails, Stopping Rules & Compliance

This is the part that separates a real recovery agent from a spam bot, so
it's called out explicitly:

- **Bounded action set** — the agent can only call a fixed list of tools
  (retry, remind, offer grace period, escalate). It cannot invent new
  actions or contact channels.
- **Retry limits** — payment retries are capped (default: 3 attempts) and
  spaced per network/provider rules to avoid triggering fraud flags or
  repeated decline penalties.
- **Contact frequency caps** — a customer can only be messaged N times per
  case per channel before the case auto-escalates to a human instead of
  continuing to nudge.
- **Risk-based human approval** — cases above `MAX_AUTO_ACTION_RISK_SCORE`
  (e.g., high-value B2B invoices, disputes, anything flagged as possible
  fraud) require a human to approve the action in the dashboard before it
  executes.
- **Opt-out respected immediately** — any customer reply indicating
  "stop"/"do not contact" halts all further automated outreach on that case
  and escalates it.
- **Full audit trail** — every automated action is logged with its reasoning
  and outcome (see above), so any recovered/attempted case can be reviewed
  or disputed after the fact.

---

## Metrics Dashboard

The dashboard's core view is a **batch report**, not just a live feed:

- Total revenue at risk detected (batch)
- Total revenue recovered (batch), with $ traced to `recovery_ledger`
- Recovery rate by playbook (e.g., payment retries vs. checkout nudges)
- Average time-to-recovery per case
- Escalation rate (cases that needed a human)
- Audit log drill-down per case

This is the view meant to answer "show me it actually worked," not just
"show me it detected problems."

---

## Known Limitations

- Prototype-grade: no production PCI-scope review has been done; do not
  point this at live card data without a proper compliance pass.
- Voice/Hinglish playbook assumes a third-party voice API (e.g., Twilio +
  a TTS/ASR provider) — not built from scratch here.
- Fraud detection is out of scope; the agent assumes cases handed to it are
  legitimate revenue-recovery opportunities, not fraud investigations.
- Single-currency assumptions in the sample schema — multi-currency ledger
  math would need hardening before real use.

---

## Roadmap

- [ ] Configurable playbooks via the dashboard (no code change to adjust
      retry counts, message copy, escalation thresholds)
- [ ] A/B testing of nudge copy and timing
- [ ] Multi-currency ledger support
- [ ] Webhook support for more providers (Razorpay, PayPal, Braintree)
- [ ] Role-based access control for the approval queue
