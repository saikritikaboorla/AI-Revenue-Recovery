# AI Revenue Recovery — Full Documentation

**Find revenue that's slipping away — and win it back, automatically.**

> **Status:** Prototype / Hackathon build. Not production-hardened.
> See [Known Limitations](#12-known-limitations--assumptions) before
> connecting real payment data.

---

## Table of Contents

1. [Overview (For Everyone)](#1-overview-for-everyone)
2. [Why This Exists](#2-why-this-exists)
3. [How It Works (The Loop)](#3-how-it-works-the-loop)
4. [Recovery Playbooks](#4-recovery-playbooks)
5. [Tech Stack](#5-tech-stack)
6. [System Architecture](#6-system-architecture)
7. [Project Structure](#7-project-structure)
8. [Developer Guide — Getting Started](#8-developer-guide--getting-started)
9. [CLI Reference](#9-cli-reference)
10. [Environment Variables](#10-environment-variables)
11. [Data Model & Audit Trail](#11-data-model--audit-trail)
12. [Known Limitations & Assumptions](#12-known-limitations--assumptions)
13. [Guardrails, Stopping Rules & Compliance](#13-guardrails-stopping-rules--compliance)
14. [Metrics Dashboard](#14-metrics-dashboard)
15. [FAQ](#15-faq)
16. [Glossary](#16-glossary)
17. [Roadmap / Future Development](#17-roadmap--future-development)
18. [Requirement Traceability (Problem Statement Alignment)](#18-requirement-traceability-problem-statement-alignment)

---

## 1. Overview (For Everyone)

If you're not technical, here's the plain-English version.

Businesses lose money in small, quiet ways every day: a customer's card
gets declined, someone abandons their cart at checkout, a subscription
fails to renew, or an invoice just doesn't get paid on time. Individually
each of these looks minor. Added up across thousands of customers, it's a
meaningful chunk of lost revenue — and today, recovering it is a manual,
reactive job for finance and support teams.

**AI Revenue Recovery is a system that watches for these moments as they
happen, figures out why the money is at risk, and automatically does the
right thing to get it back** — retrying a payment, sending a friendly
reminder, offering a short grace period, or escalating to a real person
when the situation calls for judgment.

Think of it as an always-on member of the revenue-operations team who:

- Never forgets to follow up
- Always explains their reasoning
- Never oversteps a fixed set of allowed actions
- Keeps a paper trail of everything they did and why
- Knows when to stop and hand a case to a human

The **dashboard** is where a business user watches this happen: a live
feed of at-risk revenue, what the system decided for each case, whether it
worked, and a running total of money recovered.

---

## 2. Why This Exists

Revenue leakage is rarely one clean failure — it's a chain: a payment
degrades → the customer abandons checkout → the subscription silently
lapses → the invoice goes overdue → nobody follows up in time. Today that
chain is handled by disconnected tools and manual chasing.

This project closes the loop end-to-end:

**detect → diagnose → decide → act → verify**

instead of just alerting a human and hoping they act on it.

---

## 3. How It Works (The Loop)

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

| Step | Plain-English meaning | Technical meaning |
|---|---|---|
| **Detect** | Something looks wrong with a payment or invoice | A webhook or poll picks up an event (`charge.failed`, `checkout.abandoned`, `invoice.overdue`, `mandate.failed`) and opens a `case` |
| **Diagnose** | Figure out *why* it's wrong | The agent classifies root cause: insufficient funds, expired card, bank-side decline, UX drop-off, or "customer is just late" |
| **Decide** | Pick the right fix | The agent selects exactly one playbook from a fixed, bounded menu — never invents a new action |
| **Act** | Actually try to fix it | Executes via a provider API or messaging channel: retry the charge, send an email/SMS/WhatsApp, place a voice call, or escalate |
| **Verify** | Confirm it worked | Confirms the payment cleared (or didn't), logs the outcome, updates the recovered-revenue counter, and either closes the case, loops back, or escalates |

Every case gets a unique `case_id`, and every step above is written to the
**audit log** — nothing the agent does is a black box.

---

## 4. Recovery Playbooks

Each playbook is a self-contained "if this kind of revenue risk, then this
bounded set of actions" module. The agent picks **one** playbook per case
and never mixes actions outside it.

| Playbook | Trigger | Typical Actions | Who it's for |
|---|---|---|---|
| **Payment Degradation → Root Cause → Recovery** | Card decline / failed charge | Classify decline reason → smart retry with backoff, or prompt for updated card | Any recurring or one-off card payment |
| **Checkout Drop-off Recovery** | Cart/checkout session abandoned | Timed nudge (email/SMS), optional incentive, one-click resume link | E-commerce / D2C |
| **Failed-Subscription Recovery** | Recurring billing failure | Dunning sequence (retry schedule), update-payment-method link, grace period | SaaS / subscription businesses |
| **B2B Receivables Chaser** | Invoice past due date | Staged reminders (polite → firm), escalation to AR team past N days | B2B / invoice-based billing |
| **Mandate Retry Sequencer** | Failed autopay / eNACH / UPI mandate | Retry within network-allowed windows, fallback to manual payment link | India-first recurring payments |
| **Hinglish Voice Recovery** | High-value case, no response to text | AI voice call in Hinglish for reminder/payment link, human handoff on request | High-ticket / India-first customers who don't respond to text |
| **Promise-to-Pay Tracker** | Customer commits to a pay date | Track commitment, auto-follow-up if date passes, mark broken promise for escalation | Collections / receivables |

---

## 5. Tech Stack

> **Assumption flagged:** no existing codebase was found in this
> environment, so this is a recommended, hackathon-appropriate default
> stack. Swap any row for your actual implementation — the rest of the
> documentation structure still applies.

| Layer | Choice | Why this choice | User-facing translation |
|---|---|---|---|
| **Frontend** | Next.js (React + TypeScript), Tailwind CSS | Fast to build a dashboard + live feed UI; server-side rendering for the control-tower view | This is the website/dashboard you look at |
| **Backend API** | Next.js API routes or a small Node.js (Express) service | Webhook ingestion (Stripe/Razorpay), REST endpoints for the dashboard | This is what receives "a payment just failed" the instant it happens |
| **Agent / Orchestration** | Python worker service using the **Claude API** (tool use / function calling) | Diagnosis + decision step; Claude picks a playbook and returns a *structured* action, never free-form text | This is the "brain" that decides what to do about each case |
| **Task Queue** | Redis + BullMQ (or Celery if Python-first) | Retry scheduling, dunning sequences, delayed follow-ups | This is what remembers to "check back tomorrow" |
| **Database** | PostgreSQL | Cases, audit log, recovered-revenue ledger, promise-to-pay records | This is the permanent record of everything that happened |
| **Payments** | Stripe (or Razorpay for India-first flows) webhooks + API | Source of truth for charges, subscriptions, invoices; also used to *execute* retries | This is what actually moves money |
| **Messaging** | Twilio (SMS/WhatsApp/Voice) or WhatsApp Business API | Checkout nudges, dunning messages, Hinglish voice calls | This is how the customer gets contacted |
| **Auth** | NextAuth.js or Clerk | Dashboard login for the ops team reviewing/approving actions | This keeps the dashboard private to your team |
| **Hosting** | Vercel (frontend) + Railway / Render / Fly.io (worker + Postgres + Redis) | Fastest path for a prototype deploy | Where the whole thing actually runs |
| **Observability** | Structured logs to Postgres + optional Sentry | Every agent decision is queryable, not just printed to console | How you'd debug something that went wrong |

**Why there's no separate "agent framework" listed:** the "agent" here is
intentionally a *constrained decision function*, not a free-roaming agent.
Claude is given the case data and a fixed menu of allowed
tools/actions (`retry_payment`, `send_reminder`, `offer_grace_period`,
`escalate_to_human`, etc.) via function calling, and must pick from that
menu. This keeps the system auditable and bounded rather than letting the
model free-form its way to arbitrary side effects.

---

## 6. System Architecture

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

**Design principles behind this architecture:**

- **Event-driven, not polling-first.** Webhooks trigger cases in near
  real time; polling is a fallback for providers/events without webhooks.
- **Queue between ingestion and decisioning.** This decouples "a payment
  just failed" from "the agent has capacity to think about it," so bursts
  of failures (e.g., a provider outage) don't overwhelm the system.
- **Single source of truth (Postgres).** The dashboard never talks
  directly to the payment provider for historical data — it reads from
  Postgres, which is populated by the worker. This keeps the audit trail
  authoritative.
- **Bounded tool execution.** The agent worker can only call a small,
  explicit set of functions. There is no code path where the model can
  execute an arbitrary API call.

---

## 7. Project Structure

```
ai-revenue-recovery/
├── apps/
│   ├── web/                     # Next.js dashboard + ingestion API routes
│   │   ├── pages/ or app/       # UI routes (live feed, batch report, case detail)
│   │   ├── pages/api/webhooks/  # Stripe/Razorpay webhook receivers
│   │   └── lib/                 # Shared frontend utilities, API client
│   └── worker/                  # Python agent worker
│       ├── queue_consumer.py    # Pulls jobs off Redis, runs the loop
│       ├── playbooks/           # One module per recovery playbook
│       ├── tools/               # Bounded action implementations (retry, remind, escalate...)
│       ├── cli.py                # CLI entrypoint (see CLI Reference)
│       └── requirements.txt
├── infra/
│   └── docker-compose.yml       # Local Postgres + Redis
├── db/
│   └── migrations/               # Postgres schema (cases, audit_log, recovery_ledger, promises)
├── .env.example
└── README.md
```

---

## 8. Developer Guide — Getting Started

### 8.1 Prerequisites

- Node.js 18+ and npm
- Python 3.10+
- Docker (for local Postgres + Redis)
- A Stripe test account (or Razorpay test account)
- An Anthropic API key
- (Optional) Twilio account for SMS/WhatsApp/voice playbooks

### 8.2 Setup

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

### 8.3 First test run

Once all three processes are running:

1. Trigger a test failed payment: `stripe trigger charge.failed`
2. Watch it appear in the dashboard's live feed within a few seconds
3. Watch it move through Detect → Diagnose → Decide → Act → Verify
4. Confirm it lands in the audit log (`worker.cli audit --case-id <id>`)

### 8.4 Common developer tasks

| Task | Command |
|---|---|
| Reset the local database | `npm run db:reset` (in `apps/web`) |
| Seed synthetic test cases | `python -m worker.cli seed-batch --count 50 --type failed_payment` |
| Run a single case without the UI | `python -m worker.cli run-case --case-id <id>` |
| Run without executing real actions | `python -m worker.cli run-case --case-id <id> --dry-run` |
| Add a new playbook | Add a module under `apps/worker/playbooks/`, register its trigger condition and allowed tools, add a row to the playbook table in this doc |
| Add a new allowed tool/action | Add it under `apps/worker/tools/`, then add it to the fixed menu passed to Claude's function-calling schema — the model can never call a tool that isn't registered here |

---

## 9. CLI Reference

The worker exposes a CLI for running things without the UI — useful for
demos, batch tests, debugging, and judging.

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

| Flag | Meaning |
|---|---|
| `--case-id <id>` | Target a specific case by its unique ID |
| `--batch-id <id>` | Target a specific batch (a group of cases, e.g. one seeded run or one day's ingestion) |
| `--dry-run` | Agent still diagnoses and decides, but no provider/messaging API is actually called — safe for demos and testing |
| `--follow` | Keep the terminal open and stream new audit-log entries as they're written (like `tail -f`) |
| `--count <n>` | Number of synthetic cases to generate (`seed-batch` only) |
| `--type <type>` | Type of synthetic case to generate: `failed_payment`, `abandoned_checkout`, `overdue_invoice`, `failed_mandate` |

---

## 10. Environment Variables

| Variable | Purpose | Required? |
|---|---|---|
| `DATABASE_URL` | Postgres connection string | Yes |
| `REDIS_URL` | Redis connection string for the job queue | Yes |
| `ANTHROPIC_API_KEY` | Powers the diagnose/decide step | Yes |
| `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` | Payment events + retry execution | Yes (or Razorpay equivalents) |
| `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` | SMS / WhatsApp / voice playbooks | Only if using messaging/voice playbooks |
| `NEXTAUTH_SECRET` | Dashboard auth | Yes |
| `MAX_AUTO_ACTION_RISK_SCORE` | Cases above this score require human approval instead of auto-execution | Yes (has a sane default) |
| `DRY_RUN` | If `true`, agent decides but never calls a real provider action | No (defaults to `false`) |

See `.env.example` in the repo root for the full list with sample values.

---

## 11. Data Model & Audit Trail

Every case is tracked end-to-end so results are verifiable, not just
claimed.

- **`cases`** — one row per at-risk-revenue event (payment failure,
  abandoned checkout, overdue invoice, failed mandate). Tracks status
  (`detected → diagnosing → decided → acting → recovered/failed/escalated`).

- **`audit_log`** — append-only. One row per step the agent takes on a
  case: what signal triggered it, what root cause it inferred, what
  playbook and action it chose, what it actually executed, the provider's
  response, and the outcome. This is what makes the system reviewable
  after the fact — anyone can reconstruct exactly why the agent did what
  it did for any case.

- **`recovery_ledger`** — one row per dollar (or ₹) recovered, linked back
  to its case, so the "money recovered" number shown on the dashboard is
  always traceable to real, verified provider confirmations — not an
  estimate.

- **`promises`** — for the promise-to-pay playbook: customer, committed
  date, amount, whether it was kept, and the follow-up action if it
  wasn't.

**Why append-only matters:** the audit log is never edited or deleted,
only appended to. This means the history of a case can't be quietly
rewritten after the fact — which matters both for debugging and for any
compliance review.

---

## 12. Known Limitations & Assumptions

- **Prototype-grade.** No production PCI-scope review has been done; do
  not point this at live card data without a proper compliance pass.
- **Voice/Hinglish playbook** assumes a third-party voice API (e.g.,
  Twilio + a TTS/ASR provider) — not built from scratch here.
- **Fraud detection is out of scope.** The agent assumes cases handed to
  it are legitimate revenue-recovery opportunities, not fraud
  investigations.
- **Single-currency assumptions** in the sample schema — multi-currency
  ledger math would need hardening before real use.
- **No existing codebase was confirmed** at the time this documentation
  was written — the tech stack and structure above are a recommended
  default, not a guarantee of what's actually implemented. Update this
  section once the real implementation is locked in.

---

## 13. Guardrails, Stopping Rules & Compliance

This is what separates a real recovery agent from a spam bot.

- **Bounded action set** — the agent can only call a fixed list of tools
  (retry, remind, offer grace period, escalate). It cannot invent new
  actions or contact channels.
- **Retry limits** — payment retries are capped (default: 3 attempts) and
  spaced per network/provider rules to avoid triggering fraud flags or
  repeated decline penalties.
- **Contact frequency caps** — a customer can only be messaged N times
  per case per channel before the case auto-escalates to a human instead
  of continuing to nudge.
- **Risk-based human approval** — cases above `MAX_AUTO_ACTION_RISK_SCORE`
  (e.g., high-value B2B invoices, disputes, anything flagged as possible
  fraud) require a human to approve the action in the dashboard before it
  executes.
- **Opt-out respected immediately** — any customer reply indicating
  "stop"/"do not contact" halts all further automated outreach on that
  case and escalates it.
- **Full audit trail** — every automated action is logged with its
  reasoning and outcome, so any recovered/attempted case can be reviewed
  or disputed after the fact.

---

## 14. Metrics Dashboard

The dashboard's core view is a **batch report**, not just a live feed:

- Total revenue at risk detected (batch)
- Total revenue recovered (batch), with $ traced to `recovery_ledger`
- Recovery rate by playbook (e.g., payment retries vs. checkout nudges)
- Average time-to-recovery per case
- Escalation rate (cases that needed a human)
- Audit log drill-down per case

This view answers "show me it actually worked," not just "show me it
detected problems."

---

## 15. FAQ

**Q: Can the agent take an action that isn't in the playbook table?**
No. Every action the agent can take is registered as a specific tool in
the function-calling schema. If a tool isn't registered, the model
literally cannot call it.

**Q: What happens if the agent is unsure what the root cause is?**
Low-confidence or ambiguous cases route to human escalation rather than
guessing — this is a stopping rule, not an edge case the system ignores.

**Q: How is "money recovered" verified, not just estimated?**
Every entry in `recovery_ledger` is written only after a provider (Stripe/
Razorpay) confirms the payment actually cleared — not when the agent
merely attempts a retry or sends a message.

**Q: Can I run this without connecting real payment data?**
Yes — use `--dry-run` or set `DRY_RUN=true`, and use
`worker.cli seed-batch` to generate synthetic cases for demos and testing.

**Q: What stops the system from spamming a customer?**
Contact frequency caps per case per channel, plus immediate opt-out
handling (see [Guardrails](#13-guardrails-stopping-rules--compliance)).

---

## 16. Glossary

| Term | Meaning |
|---|---|
| **Case** | One at-risk-revenue event (a failed payment, an abandoned checkout, an overdue invoice, a failed mandate) tracked end-to-end |
| **Playbook** | A fixed, self-contained set of allowed actions for one type of revenue risk |
| **Dunning** | The process of communicating with a customer to collect a past-due or failed payment |
| **Mandate** | A pre-authorized recurring payment instruction (e.g., eNACH, UPI Autopay) |
| **Grace period** | A short window given to a customer to fix a payment issue before further action is taken |
| **Escalation** | Handing a case off to a human instead of continuing automated action |
| **Audit log** | The append-only record of every step the agent took on a case |
| **Recovery ledger** | The record of verified, actually-recovered revenue, linked to provider confirmations |
| **Dry run** | A mode where the agent decides what it would do but does not execute any real action |
| **Hinglish** | A colloquial mix of Hindi and English commonly used in India; here, the language used in the voice-recovery playbook |

---

## 17. Roadmap / Future Development

**Near-term**
- [ ] Configurable playbooks via the dashboard (adjust retry counts,
      message copy, escalation thresholds without a code change)
- [ ] A/B testing of nudge copy and timing
- [ ] Role-based access control for the approval queue

**Medium-term**
- [ ] Multi-currency ledger support
- [ ] Webhook support for more providers (Razorpay, PayPal, Braintree)
- [ ] Configurable contact-frequency and retry-limit policies per
      customer segment
- [ ] Self-serve payment-method update page for customers (reduces need
      for outbound contact entirely)

**Longer-term / exploratory**
- [ ] Predictive risk scoring — flag subscriptions likely to fail *before*
      the charge attempt, not just after
- [ ] Expanded voice-language support beyond Hinglish
- [ ] Fraud-aware routing — a distinct pipeline for cases that look like
      fraud rather than genuine payment friction
- [ ] Customer-level recovery history and lifetime-value-aware
      intervention selection (e.g., don't over-discount a low-LTV
      customer to save one payment)

---

## 18. Requirement Traceability (Problem Statement Alignment)

| Problem statement requirement | Addressed by | How |
|---|---|---|
| Detect revenue at risk | [§3 How It Works](#3-how-it-works-the-loop) — Detect step | Webhook/poll ingestion catches failed charges, abandoned checkouts, overdue invoices, failed mandates |
| Determine the right intervention | [§3](#3-how-it-works-the-loop) — Diagnose + Decide steps | Root-cause classification feeds a bounded playbook selection |
| Execute a bounded recovery workflow | [§4 Playbooks](#4-recovery-playbooks), [§5 Tech Stack](#5-tech-stack) | Agent picks exactly one playbook per case from a fixed tool menu — no free-form actions |
| Payment degradation → root cause → recovery action | [§4](#4-recovery-playbooks) row 1 | Decline classification → smart retry w/ backoff or prompt for updated card |
| Checkout drop-off recovery | [§4](#4-recovery-playbooks) row 2 | Timed nudge, optional incentive, one-click resume link |
| Failed-subscription recovery | [§4](#4-recovery-playbooks) row 3 | Dunning sequence, update-payment-method link, grace period |
| B2B receivables chaser | [§4](#4-recovery-playbooks) row 4 | Staged reminders, escalation to AR team past N days |
| Mandate retry sequencer | [§4](#4-recovery-playbooks) row 5 | Retry within network-allowed windows, fallback to manual payment link |
| Hinglish voice recovery | [§4](#4-recovery-playbooks) row 6 | AI voice call in Hinglish, human handoff on request |
| Promise-to-pay tracker | [§4](#4-recovery-playbooks) row 7, [§11 Data Model](#11-data-model--audit-trail) `promises` | Tracks commitment, auto-follow-up, broken-promise escalation |
| Measured money recovered across a batch | [§11](#11-data-model--audit-trail) `recovery_ledger`, [§14 Metrics](#14-metrics-dashboard), [§9 CLI](#9-cli-reference) `report` | Every recovered dollar linked to a verified provider confirmation; batch report shows totals, recovery rate, time-to-recovery |
| Compliant escalation | [§13 Guardrails](#13-guardrails-stopping-rules--compliance) — Risk-based human approval | Cases above `MAX_AUTO_ACTION_RISK_SCORE` require human sign-off |
| Stopping rules | [§13](#13-guardrails-stopping-rules--compliance) — Retry limits, contact caps, opt-out | Capped retries, capped contacts per channel, immediate halt on opt-out |
| Audit trail | [§11](#11-data-model--audit-trail) `audit_log`, `cases` | Append-only log of every signal, cause, action, response, and outcome per `case_id` |

**Coverage:** every example direction and every "the bar" requirement from
the original problem statement has a named, addressed section above.

---

*End of documentation. For a one-page summary of the alignment table only,
see `AI_Revenue_Recovery_Aligned_Documentation.md`.*
