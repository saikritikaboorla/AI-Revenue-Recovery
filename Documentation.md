# AI Revenue Recovery — Aligned Documentation

This document reconciles the original **problem statement** (as given by the
hackathon/brief) with the **project README** already drafted for this build,
so reviewers and judges can see at a glance that every requirement is
addressed and where.

---

## 1. Problem Statement (source)

> **AI Revenue Recovery**
> Find revenue that's slipping away and win it back
>
> Build an agent that detects revenue at risk, determines the right
> intervention, and executes a bounded recovery workflow: from payment
> failures and checkout abandonment to overdue receivables.
>
> **Why now:** Revenue loss rarely happens in one clean step. A payment
> degrades, a checkout gets abandoned, a subscription fails, or an invoice
> goes overdue. AI can now close the loop from detecting the problem to
> diagnosing it, choosing the right intervention, and recovering the money.
>
> **Example directions:**
> - Payment degradation → root cause → recovery action
> - Checkout drop-off recovery
> - Failed-subscription recovery
> - B2B receivables chaser
> - Mandate retry sequencer
> - Hinglish voice recovery
> - Promise-to-pay tracker
>
> **The bar:** Don't just identify the problem. Show measured money
> recovered across a batch, with compliant escalation, stopping rules, and
> an audit trail.

---

## 2. Requirement → Implementation Traceability

| Problem statement requirement | Addressed by (README section) | How |
|---|---|---|
| Detect revenue at risk | *How It Works (The Loop)* — Detect step | Webhook/poll ingestion catches failed charges, abandoned checkouts, overdue invoices, failed mandates |
| Determine the right intervention | *How It Works (The Loop)* — Diagnose + Decide steps | Root-cause classification (card / bank / UX / fraud / late-payer) feeds a bounded playbook selection |
| Execute a **bounded** recovery workflow | *Recovery Playbooks*, *Tech Stack* ("Why an agent framework isn't listed separately") | Agent picks exactly one playbook per case from a fixed tool menu (`retry_payment`, `send_reminder`, `offer_grace_period`, `escalate_to_human`) — no free-form actions |
| Payment degradation → root cause → recovery action | *Recovery Playbooks* row 1 | Decline classification → smart retry w/ backoff or prompt for updated card |
| Checkout drop-off recovery | *Recovery Playbooks* row 2 | Timed nudge, optional incentive, one-click resume link |
| Failed-subscription recovery | *Recovery Playbooks* row 3 | Dunning sequence, update-payment-method link, grace period |
| B2B receivables chaser | *Recovery Playbooks* row 4 | Staged reminders, escalation to AR team past N days |
| Mandate retry sequencer | *Recovery Playbooks* row 5 | Retry within network-allowed windows, fallback to manual payment link |
| Hinglish voice recovery | *Recovery Playbooks* row 6 | AI voice call in Hinglish, human handoff on request |
| Promise-to-pay tracker | *Recovery Playbooks* row 7, *Data Model* `promises` table | Tracks commitment date/amount, auto-follow-up, broken-promise escalation |
| **Measured** money recovered across a batch | *Data Model* `recovery_ledger`, *Metrics Dashboard*, *CLI Reference* `report` command | Every recovered dollar is linked to a verified provider confirmation, not an estimate; batch report shows totals, recovery rate by playbook, time-to-recovery |
| Compliant escalation | *Guardrails, Stopping Rules & Compliance* — Risk-based human approval | Cases above `MAX_AUTO_ACTION_RISK_SCORE` require human sign-off before execution |
| Stopping rules | *Guardrails, Stopping Rules & Compliance* — Retry limits, Contact frequency caps, Opt-out respected | Capped retries, capped contact attempts per channel, immediate halt on opt-out |
| Audit trail | *Data Model & Audit Trail* — `audit_log`, `cases` | Append-only log of every signal, inferred cause, chosen action, provider response, and outcome per `case_id` |

**Gap check:** every example direction and every "the bar" requirement from
the problem statement has a corresponding, named section in the README.
No requirement is currently unaddressed.

---

## 3. Full Project Documentation

The complete technical README (architecture, tech stack, setup, CLI
reference, environment variables, data model, guardrails, metrics, known
limitations, and roadmap) is maintained as the canonical build doc. See
`README.md` in the project root for the full text — this document exists
specifically to show *alignment*, not to duplicate it.

Key sections for judges to check first, in the order the bar is graded:

1. **Proof it detects the problem** → *How It Works (The Loop)* + *Architecture*
2. **Proof of measured recovery** → *Metrics Dashboard*, `worker.cli report`
3. **Proof of compliant escalation & stopping rules** → *Guardrails, Stopping Rules & Compliance*
4. **Proof of an audit trail** → *Data Model & Audit Trail*, `worker.cli audit --follow`

---

## 4. Open Items / Flagged Assumptions

Carried over from the README so they aren't lost in this alignment pass:

- **No existing codebase was found** in the environment — the tech stack in
  the README is a recommended default, not a confirmed implementation.
  Swap it out if the actual build differs.
- **Prototype status** — not PCI-reviewed; don't connect live card data
  without a compliance pass.
- **Voice/Hinglish playbook** depends on a third-party voice API (not
  built from scratch).
- **Fraud detection is out of scope** — the agent assumes cases handed to
  it are legitimate recovery opportunities.
- **Single-currency assumption** in the current schema.

---

*This alignment document is meant to sit alongside the main README as a
one-page "does the build meet the brief" reference for reviewers.*
