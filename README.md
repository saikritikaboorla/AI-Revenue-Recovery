# RecoverAI — AI Revenue Recovery Platform

> **Razorpay AI Buildathon Submission**  
> **Autonomous Closed-Loop Revenue Recovery Engine: Detect → Diagnose → Decide → Act → Verify → Stop/Escalate → Measure → Audit**

RecoverAI detects revenue at risk, determines the optimal win-back intervention, and executes bounded recovery workflows—from transaction gateway outages and mobile checkout dropoffs to recurring mandate failures and overdue B2B receivables.

---

## 🌟 Key Features

1. **Closed-Loop Agent Architecture**:
   - **Detect**: Instant webhook ingestion of transaction failures, mandate breaches, and overdue invoices.
   - **Diagnose**: Deep contextual reasoning (LTV, failure codes, transient banking cluster latency, credit risk).
   - **Decide**: Explainable decision models with confidence scores and decision factors.
   - **Act**: Dynamic 1-click WhatsApp recovery links, multi-gateway failover via Razorpay Optimizer, SMS deep-links, AI Voice IVR, or morning NACH batch rescheduling.
   - **Verify**: Razorpay webhook settlement verification.
   - **Stop/Escalate**: Built-in guardrails (max retries, 15m cooldown, contact caps, financial risk thresholds).
   - **Measure & Audit**: Real-time metrics and immutable event log.

2. **FinTech Command Center & Visual Direction**:
   - Dark smoky-black palette (`#080B12`, `#10151F`, `#141A24`, `#252D3A`).
   - Electric blue AI accents (`#3B82F6`), Emerald recovered revenue (`#22C55E`), Amber at-risk revenue (`#F59E0B`).
   - React Bits **FoldText** GSAP hero animation.
   - Interactive **GlowCursor**, **GhostCursor**, and ambient **Galaxy** starfield.

3. **Production Simulation & Batch Evaluation Engine**:
   - Interactive batch generator for judges to simulate realistic revenue-loss vectors at scale (2 to 12 cases per batch).
   - Real-time before/after metrics showing recoverable revenue, recovered amount, win rate, and guardrail escalations.

4. **Unified Full-Stack Architecture**:
   - Next.js App Router with unified serverless API routes on a single public Vercel domain.
   - Integrated Razorpay live test-mode client with seamless simulated adapter fallback.

---

## 🚀 Getting Started

### Prerequisites
- Node.js >= 18.0.0
- npm >= 9.0.0

### Installation
```bash
git clone https://github.com/saikritikaboorla/AI-Revenue-Recovery.git
cd AI-Revenue-Recovery
npm install
```

### Environment Variables
Copy `.env.example` to `.env.local`:
```bash
cp .env.example .env.local
```
Add your Razorpay API keys if test mode is desired (optional):
```env
RAZORPAY_KEY_ID=rzp_test_xxxxxxx
RAZORPAY_KEY_SECRET=your_secret_key
```

### Run Locally
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) for the landing experience, or [http://localhost:3000/dashboard](http://localhost:3000/dashboard) for the command center.

### Production Build
```bash
npm run build
npm run start
```
