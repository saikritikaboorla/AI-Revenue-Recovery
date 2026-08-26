# RecoverAI — AI Revenue Recovery

**Find revenue that's slipping away and win it back, automatically.**

RecoverAI is an agentic system that watches your payment and receivables data, figures out *why* money is at risk, selects the right intervention from a bounded playbook set, executes a recovery workflow, and writes an immutable audit trail of every action and every rupee recovered.

> **Status:** Prototype / Hackathon build. Uses a Razorpay mock adapter by default — no live payment credentials required to run.

---

## Table of Contents

1. [What This Does](#what-this-does)
2. [How It Works — The Loop](#how-it-works--the-loop)
3. [Recovery Playbooks](#recovery-playbooks)
4. [Tech Stack](#tech-stack)
5. [Architecture](#architecture)
6. [Project Structure](#project-structure)
7. [Getting Started](#getting-started)
8. [Environment Variables](#environment-variables)
9. [API Routes](#api-routes)
10. [Data Model](#data-model)
11. [Guardrails & Stopping Rules](#guardrails--stopping-rules)
12. [Dashboard Views](#dashboard-views)
13. [Known Limitations](#known-limitations)
14. [Roadmap](#roadmap)

---

## What This Does

RecoverAI is a Next.js 16 web app and autonomous agent that does three things a revenue-ops team would otherwise do manually:

1. **Detects** revenue at risk — a failed payment, abandoned checkout, subscription that failed to renew, overdue B2B invoice, or failed e-NACH mandate.
2. **Diagnoses** the root cause — bank downtime, OTP timeout, mandate limit exceeded, insufficient funds, customer drop-off — and scores recovery confidence.
3. **Recovers** the money — picks one bounded action (gateway failover, WhatsApp link, IVR call, NACH reschedule, discount offer, or human escalation), executes it through the Razorpay adapter, and logs every step in an append-only audit trail.

The dashboard is the control tower: live recovery queue, playbook analytics charts, batch simulator, escalation approvals, promise-to-pay tracker, audit log, and configurable guardrail policy — all in a single Next.js app with no separate backend process.

---

## How It Works — The Loop

```
EVENT → DETECT → DIAGNOSE → RISK SCORE → SELECT PLAYBOOK → GUARDRAIL CHECK → EXECUTE ACTION → VERIFY → WRITE LEDGER → STOP / ESCALATE
```

Every case that enters the loop gets a unique case ID. Every step above is written to an append-only audit log so nothing the agent does is a black box.

**Nine pipeline stages (as rendered in the landing page):**

| Stage | What Happens |
|---|---|
| Detect | Webhook / poll catches a failure or overdue event in real time |
| Diagnose | Deep contextual reasoning: LTV, error codes, banking latency |
| Risk Score | Probabilistic recovery confidence with weighted decision factors |
| Select Playbook | Maps failure signature to the optimal bounded recovery strategy |
| Guardrail Check | Max-retry, cooldown, contact-cap, and value-threshold gates |
| Execute Action | WhatsApp link, gateway failover, IVR call, or NACH reschedule |
| Verify | Razorpay webhook confirms successful settlement |
| Write Ledger | Immutable append-only entry written to recovery ledger |
| Measure Recovery | Win-rate, recovered value, and agent attribution updated |

---

## Recovery Playbooks

Seven self-contained playbooks. The agent picks exactly one per case and may only call actions within that playbook's `allowedActions` list.

| # | Playbook | Trigger Event | Allowed Actions | Max Retries |
|---|---|---|---|---|
| 1 | **Payment Degradation & Gateway Failover** | `payment.failed` (bank/gateway timeout) | `switch_gateway_optimizer`, `instant_upi_failover`, `card_network_switch` | 3 |
| 2 | **Checkout Abandonment Cart Recovery** | `checkout.session_expired_without_auth` | `send_checkout_resume_link`, `apply_instant_settlement_discount`, `whatsapp_quickpay` | 2 |
| 3 | **Recurring Subscription Invoicing** | `subscription.charge_failed` (mandate limit) | `request_payment_method_update`, `send_afa_authorization_link`, `offer_grace_period` | 3 |
| 4 | **B2B Overdue Invoices & Receivables** | `invoice.overdue_net30_breached` | `create_payment_link`, `apply_5pct_early_discount`, `escalate_to_relationship_manager` | 2 |
| 5 | **e-NACH & Mandate Clearing Reschedule** | `mandate.debit_declined_insufficient_funds` | `schedule_morning_batch_retry`, `split_mandate_charge`, `notify_mandate_update` | 3 |
| 6 | **Hinglish Conversational AI Assist** | `payment.dropped_upi_intent` | `send_hinglish_whatsapp_prompt`, `dispatch_assisted_ivr_call`, `send_upi_intent_qr` | 2 |
| 7 | **Promise-to-Pay (P2P) Tracker** | `customer.promise_to_pay_created` | `create_promise_to_pay`, `send_milestone_reminder`, `escalate_broken_promise` | 1 |

---

## Tech Stack

This is what is **actually used** in the codebase — no aspirational stack items.

| Layer | What's Used | Details |
|---|---|---|
| **Framework** | Next.js 16.3.3 (App Router) | Single monolith — both frontend and all API routes live here. No separate backend process. |
| **Language** | TypeScript 5 | Strict types throughout (`src/lib/types.ts` defines all domain models) |
| **React** | React 19.2.8 | All components are Client Components (`"use client"`) |
| **Styling** | Tailwind CSS v4 + `tailwind-merge` | Dark-mode dashboard with custom CSS variables in `globals.css` |
| **Animation** | Framer Motion 13 + GSAP 3.15 | Page transitions, micro-interactions, loading screen |
| **3D / WebGL** | Three.js 0.185 + OGL 1.0 | Galaxy background on landing page (browser-only, `ssr: false`) |
| **Charts** | Recharts 3.10 | Playbook analytics: bar charts, area charts, pie charts |
| **Icons** | Lucide React 1.34 | All dashboard icons |
| **Confetti** | canvas-confetti 1.9 | Recovery celebration effect |
| **State / Data Store** | In-memory singleton (`DatabaseService`) | No external database. All data lives in server-side Maps seeded from CSV files at startup. |
| **Seed Data** | CSV files in `data/seed/` | `customers.csv`, `recovery_cases.csv`, `audit_log.csv`, `recovery_ledger.csv`, `escalations.csv`, `promises.csv` |
| **Payment Adapter** | Razorpay mock adapter (`RazorpayService`) | Falls back to a high-fidelity mock when `RAZORPAY_KEY_ID` is not set. Supports live test mode with real credentials. |
| **Agent Engine** | `RecoveryAgentEngine` + `RecoveryPipeline` | Pure TypeScript decision engine — no LLM API called at runtime. Uses a deterministic decision matrix keyed on failure reason, customer segment, and guardrail state. |
| **Simulation Engine** | `SimulationEngine` | Generates synthetic cases (1–100 batch) and runs them through the full pipeline. Probabilistic win/loss outcome. |
| **Hosting** | Vercel (`.vercel/project.json` present) | `next build` + `next start` or Vercel serverless |
| **Package Manager** | npm (lockfile version 3) | |
| **Linter** | ESLint 9 + `eslint-config-next` | |

### Why no LLM / Claude API at runtime?

The agent is intentionally a **constrained decision function**, not a free-form model call. A deterministic decision matrix (`agent-engine.ts`, `playbooks/engine.ts`) maps each combination of failure reason + customer segment + guardrail state to exactly one playbook and one action. This keeps the system:

- **Auditable** — every decision is fully reproducible and explainable without a model trace.
- **Bounded** — the agent cannot invent actions outside the allowed set.
- **Zero-latency** — no API round-trip on the critical recovery path.
- **Demo-safe** — runs fully offline with no external API keys required.

---

## Architecture

```
Browser
  │
  ├── / (Landing Page)          → page.tsx — Galaxy WebGL, pipeline explainer, playbook cards
  └── /dashboard                → dashboard/page.tsx — 7-tab control tower
        │
        ├── Recovery Queue      → RecoveryQueue.tsx + GET /api/cases
        ├── Playbook Analytics  → RecoveryCharts.tsx + GET /api/metrics
        ├── Batch Simulator     → SimulationRunner.tsx + POST /api/simulate
        ├── Escalations         → EscalationsView.tsx + GET /api/escalations
        ├── Promise-to-Pay      → PromiseToPay.tsx + GET /api/promises
        ├── Audit Trail         → AuditTrailView.tsx + GET /api/audit
        └── Guardrail Policy    → GuardrailSettingsView.tsx + GET|PATCH /api/guardrails

Next.js API Routes (src/app/api/)
  ├── GET  /api/cases                → list all cases (filter: playbook, status, search)
  ├── GET  /api/cases/[id]           → single case with full audit + decisions
  ├── POST /api/cases/[id]/action    → run RecoveryPipeline.processCase(id)
  ├── GET  /api/metrics              → dashboard KPIs from DatabaseService
  ├── POST /api/simulate             → SimulationEngine.runBatchSimulation(config)
  ├── GET  /api/escalations          → list escalations
  ├── GET  /api/promises             → list promise-to-pay records
  ├── GET  /api/audit                → recent 100 audit events (or by caseId)
  ├── GET|PATCH /api/guardrails      → read/update guardrail policy
  └── GET  /api/health               → server health check

Server-side Singleton (Node.js process memory)
  └── DatabaseService (src/lib/db/index.ts)
        ├── customers: Map<id, CustomerRecord>       ← seeded from customers.csv
        ├── cases: Map<id, RecoveryCaseRecord>       ← seeded from recovery_cases.csv
        ├── ledger: Map<id, RecoveryLedgerRecord>    ← seeded from recovery_ledger.csv
        ├── audits: AuditRecord[]                    ← seeded from audit_log.csv
        ├── escalations: Map<id, EscalationRecord>   ← seeded from escalations.csv
        ├── promises: Map<id, PromiseRecord>         ← seeded from promises.csv
        └── guardrails: GuardrailPolicy              ← in-memory defaults, PATCH via API
```

> **Important:** Because `DatabaseService` is a server-side in-memory singleton, data resets on every server restart/cold start. This is intentional for a prototype — add a real database (Postgres/PlanetScale) to make it persistent.

---

## Project Structure

```
AI-Revenue-Recovery/
├── src/
│   ├── app/
│   │   ├── page.tsx                    # Landing page (Galaxy, pipeline explainer, playbooks)
│   │   ├── layout.tsx                  # Root layout — fonts, metadata
│   │   ├── globals.css                 # Tailwind + custom dark theme CSS variables
│   │   ├── error.tsx                   # Root error boundary
│   │   ├── dashboard/
│   │   │   ├── page.tsx                # 7-tab dashboard (Client Component)
│   │   │   └── error.tsx               # Dashboard error boundary
│   │   └── api/
│   │       ├── cases/
│   │       │   ├── route.ts            # GET /api/cases
│   │       │   └── [id]/
│   │       │       ├── route.ts        # GET /api/cases/[id]
│   │       │       └── action/
│   │       │           └── route.ts    # POST /api/cases/[id]/action
│   │       ├── metrics/route.ts        # GET /api/metrics
│   │       ├── simulate/route.ts       # POST /api/simulate
│   │       ├── escalations/route.ts    # GET /api/escalations
│   │       ├── promises/route.ts       # GET /api/promises
│   │       ├── audit/route.ts          # GET /api/audit
│   │       ├── guardrails/route.ts     # GET|PATCH /api/guardrails
│   │       └── health/route.ts         # GET /api/health
│   │
│   ├── components/
│   │   ├── Navbar.tsx                  # Top navigation bar with live metrics ticker
│   │   ├── LoadingScreen.tsx           # Animated loading screen with progress steps
│   │   ├── MetricsOverview.tsx         # KPI cards: at-risk, recovered, recovery rate
│   │   ├── RecoveryQueue.tsx           # Live case list with filter/search + action trigger
│   │   ├── DecisionTraceModal.tsx      # Modal: full agent decision trace + audit timeline
│   │   ├── SimulationRunner.tsx        # Batch simulator UI (1–100 cases, live progress)
│   │   ├── GuardrailSettingsView.tsx   # Guardrail policy editor (sliders + toggles)
│   │   ├── AuditTrailView.tsx          # Append-only audit log table with stage badges
│   │   ├── EscalationsView.tsx         # Escalations list + approve/reject actions
│   │   ├── PromiseToPay.tsx            # P2P tracker with status badges and calendar dates
│   │   ├── charts/
│   │   │   └── RecoveryCharts.tsx      # Recharts: playbook bar, category pie, area trend
│   │   ├── effects/
│   │   │   ├── Galaxy.tsx              # Three.js / OGL galaxy particle system (WebGL)
│   │   │   ├── Galaxy.css              # Galaxy canvas styles
│   │   │   ├── FoldText.tsx            # GSAP animated fold/reveal text effect
│   │   │   ├── GhostCursor.tsx         # Ghost trail cursor effect
│   │   │   └── GlowCursor.tsx          # Glow cursor effect
│   │   └── ui/                         # Shared primitive UI components
│   │
│   ├── lib/
│   │   ├── types.ts                    # All TypeScript domain types
│   │   ├── store.ts                    # RecoverAIStore (legacy in-memory store, used by agent-engine)
│   │   ├── agent-engine.ts             # RecoveryAgentEngine: diagnose+decide+execute (store-backed)
│   │   ├── simulation-engine.ts        # SimulationEngine: batch case generation + pipeline
│   │   ├── razorpay-adapter.ts         # RazorpayService: live test mode + mock fallback
│   │   ├── db/
│   │   │   └── index.ts                # DatabaseService: CSV-seeded in-memory Maps
│   │   └── playbooks/
│   │       ├── index.ts                # PlaybookType enum + PLAYBOOK_CONFIGS
│   │       └── engine.ts               # RecoveryPipeline: full 9-stage processing
│   │
│   └── data/                           # (legacy) static seed data referenced by store.ts
│
├── data/
│   └── seed/                           # CSV seed files loaded by DatabaseService at startup
│       ├── customers.csv               # 20 synthetic Indian customer profiles
│       ├── recovery_cases.csv          # ~100 pre-seeded recovery cases across all playbooks
│       ├── audit_log.csv               # ~500 audit events across seeded cases
│       ├── recovery_ledger.csv         # Verified recovery ledger entries
│       ├── escalations.csv             # Pre-seeded escalation records
│       └── promises.csv                # Pre-seeded promise-to-pay records
│
├── public/                             # Static assets (SVGs)
├── package.json                        # npm dependencies (see Tech Stack)
├── next.config.ts                      # Next.js config
├── tsconfig.json                       # TypeScript config
├── postcss.config.mjs                  # PostCSS + Tailwind v4
├── eslint.config.mjs                   # ESLint 9 flat config
└── .env.example                        # Environment variable template
```

---

## Getting Started

### Prerequisites

- Node.js 20+
- npm 10+
- No database, no Redis, no external API keys required to run locally

### Setup

```bash
# 1. Clone and enter the repo
git clone <your-repo-url> AI-Revenue-Recovery
cd AI-Revenue-Recovery

# 2. Install dependencies
npm install

# 3. (Optional) Copy env file and add Razorpay test credentials
#    Without credentials the Razorpay mock adapter activates automatically
cp .env.example .env

# 4. Run the dev server
npm run dev
# → http://localhost:3000
```

That's it. The app seeds all data from CSV files in `data/seed/` on first request. No migrations, no docker, no worker process.

### Production Build

```bash
npm run build
npm run start
```

---

## Environment Variables

| Variable | Required | Purpose |
|---|---|---|
| `RAZORPAY_KEY_ID` | Optional | Razorpay test-mode key. If omitted, the mock adapter runs automatically. |
| `RAZORPAY_KEY_SECRET` | Optional | Razorpay test-mode secret. |
| `NEXT_PUBLIC_APP_URL` | Optional | Public base URL (used for link generation). Defaults to `http://localhost:3000`. |
| `NODE_ENV` | Auto-set | `development` / `production` |

No database URL, no Redis URL, no auth secrets required. The app runs fully on in-memory state seeded from CSV files.

---

## API Routes

All routes are Next.js App Router route handlers under `src/app/api/`.

| Method | Route | Description |
|---|---|---|
| `GET` | `/api/cases` | List all cases. Query params: `playbook`, `status`, `search` |
| `GET` | `/api/cases/[id]` | Single case with decisions, interventions, and audit logs |
| `POST` | `/api/cases/[id]/action` | Trigger full recovery pipeline on a case |
| `GET` | `/api/metrics` | Dashboard KPIs: totals, recovery rate, playbook breakdown, recent recoveries |
| `POST` | `/api/simulate` | Run batch simulation. Body: `{ batchSize: number (1–100) }` |
| `GET` | `/api/escalations` | List all escalation records |
| `POST` | `/api/escalations` | Approve or reject an escalation |
| `GET` | `/api/promises` | List all promise-to-pay records |
| `GET` | `/api/audit` | Last 100 audit events. Query param: `caseId` to filter |
| `GET` | `/api/guardrails` | Current guardrail policy |
| `PATCH` | `/api/guardrails` | Update guardrail policy (persists in-memory for session) |
| `GET` | `/api/health` | Health check — returns `{ status: "ok" }` |

---

## Data Model

### `RecoveryCaseRecord`
One row per revenue-at-risk event. Fields include `id`, `customer_*`, `amount`, `currency`, `playbook`, `failure_reason`, `status`, `recovery_confidence`, `recovered_amount`, `retry_count`, `diagnosis_summary`, `rationale`, `escalation_reason`, `escalated_to`.

**Status progression:**
```
DETECTED → DIAGNOSING → DECIDED → ACTION_IN_PROGRESS → RECOVERED
                                                      → ESCALATED
                                                      → STOPPED_MAX_RETRIES
```

### `AuditRecord`
Append-only. One row per pipeline stage executed on a case. Fields: `id`, `case_id`, `timestamp`, `stage`, `actor`, `action`, `result`, `details`.

**Stages:** `DETECT` → `DIAGNOSE` → `DECIDE_PLAYBOOK` → `CHECK_GUARDRAILS` → `EXECUTE_ACTION` → `VERIFY` → `STOP_OR_ESCALATE`

**Actors:** `RECOVER_AI_DIAGNOSTIC_MODEL`, `RECOVER_AI_PLAYBOOK_RUNNER`, `GUARDRAIL_COMPLIANCE_MONITOR`, `RAZORPAY_WEBHOOK_HANDLER`, `RECOVER_AI_ENGINE`

### `RecoveryLedgerRecord`
One row per verified recovery. Linked to its case. Amount is only written here when Razorpay (or the mock adapter) confirms capture — not on prediction. Fields include `idempotency_key` to prevent double-counting.

### `EscalationRecord`
Created when a guardrail triggers human review. Status: `PENDING` → `APPROVED` / `REJECTED` / `RESOLVED`.

### `PromiseRecord`
Tracks customer settlement commitments. Status: `PROMISED` → `UPCOMING` → `DUE` → `KEPT` / `BROKEN` / `ESCALATED`.

### `GuardrailPolicy`
In-memory, editable via `PATCH /api/guardrails`. Fields:

| Field | Default | Meaning |
|---|---|---|
| `maxRetries` | 3 | Max automated retry attempts before escalation |
| `cooldownHours` | 0.25 | Minimum gap between retries (15 min) |
| `maxRiskScoreForAutonomousAction` | 65 | Risk scores above this require human approval |
| `highValueThreshold` | ₹1,00,000 | Amounts above this require human approval |
| `dailyContactLimit` | 2 | Max customer contacts per day per case |
| `enableVoiceAiForEnterpriseOnly` | false | Restricts IVR/voice playbook to ENTERPRISE segment |

---

## Guardrails & Stopping Rules

The agent will **not** execute an autonomous action if any of these conditions are true:

- `retry_count >= guardrails.maxRetries` (max retries reached)
- `customer_risk_score > guardrails.maxRiskScoreForAutonomousAction` (risk too high)
- `amount > guardrails.highValueThreshold` (value too high for autonomous action)

In all three cases the case is moved to `ESCALATED` status, an `EscalationRecord` is created and assigned to a human ops specialist, and the audit log records which guardrail triggered.

All guardrail thresholds are configurable live from the dashboard's **Guardrail Policy** tab without redeployment.

---

## Dashboard Views

The `/dashboard` page has seven tabs:

| Tab | Component | What It Shows |
|---|---|---|
| Recovery Queue | `RecoveryQueue.tsx` | Live list of all cases. Filter by playbook/status/search. Click a case to open the Decision Trace modal with full agent reasoning + audit timeline. Click "Run Recovery" to trigger the pipeline. |
| Playbook Analytics | `RecoveryCharts.tsx` | Bar chart of recovery rate per playbook, area chart of recovery over time, pie chart of case distribution by category |
| Batch Simulator | `SimulationRunner.tsx` | Generates 1–100 synthetic cases and runs them through the full pipeline. Shows live progress, per-case result table, and batch summary metrics. |
| Escalations & Approvals | `EscalationsView.tsx` | Cases that hit a guardrail. Approve or reject to unblock or close. |
| Promise-to-Pay | `PromiseToPay.tsx` | Tracks customer settlement commitments, due dates, and status. |
| Immutable Audit Trail | `AuditTrailView.tsx` | Append-only log of all pipeline events with stage, actor, action, result, and timestamp. |
| Guardrail Policy | `GuardrailSettingsView.tsx` | Live editor for all guardrail thresholds. Changes take effect immediately for new cases. |

---

## Known Limitations

- **In-memory only.** All data resets on server restart. For persistence, replace `DatabaseService` with a Postgres/PlanetScale adapter.
- **No authentication.** The dashboard has no login. Add NextAuth.js or Clerk before any production use.
- **Deterministic agent, not LLM-powered.** The decision engine is a hand-coded decision matrix, not a live model call. This is intentional for demo reliability and auditability.
- **Razorpay mock adapter.** Without real credentials, no actual payment operations are performed. The mock returns realistic-looking responses.
- **Single currency (INR).** The ledger math and display assume Indian Rupees.
- **No real-time webhooks.** Cases are updated by API calls from the dashboard, not by live Razorpay webhooks (though the data model and audit log are designed to support them).
- **Prototype compliance.** No PCI-scope review has been done. Do not connect to live cardholder data without a compliance pass.

---

## Roadmap

- [ ] Persistent database (Postgres) — replace in-memory `DatabaseService`
- [ ] Live Razorpay webhook ingestion (`/api/webhooks/razorpay`)
- [ ] Dashboard authentication (NextAuth.js or Clerk)
- [ ] Configurable playbook parameters from UI (retry counts, message copy, thresholds)
- [ ] A/B testing of nudge copy and timing
- [ ] Multi-currency ledger support
- [ ] Role-based access control for the approval queue
- [ ] LLM-assisted diagnosis step (Claude function calling for edge cases)
