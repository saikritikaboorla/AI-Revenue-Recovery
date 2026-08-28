import fs from 'fs';
import path from 'path';
import { PlaybookType, PLAYBOOK_CONFIGS } from '../playbooks';
import type { AIDecisionRecord } from '../ai-decision';

const DEFAULT_GUARDRAILS: GuardrailPolicy = {
  maxRetries: 3,
  cooldownHours: 0.25,
  maxRiskScoreForAutonomousAction: 65,
  highValueThreshold: 100000,
  dailyContactLimit: 2,
  enableAssistedVoiceForEnterpriseOnly: false,
};

const RUNTIME_STATE_FILE = path.join(process.cwd(), '.cache', 'recoverai-runtime-state.json');

export interface CustomerRecord {
  id: string;
  name: string;
  email: string;
  phone: string;
  segment: 'HIGH_LTV_VIP' | 'ENTERPRISE' | 'SMB' | 'D2C_RETAIL';
  lifetime_value: number;
  risk_score: number;
  past_recovery_rate: number;
  contact_preference: string;
  created_at: string;
}

export interface RecoveryCaseRecord {
  id: string;
  customer_id: string;
  customer_name: string;
  customer_email: string;
  customer_segment: string;
  customer_risk_score: number;
  amount: number;
  currency: string;
  playbook: PlaybookType;
  failure_reason: string;
  status: 'DETECTED' | 'DIAGNOSING' | 'DECIDED' | 'ACTION_IN_PROGRESS' | 'RECOVERED' | 'ESCALATED' | 'STOPPED_MAX_RETRIES' | 'STOPPED_UNRECOVERABLE';
  current_step: string;
  recovery_confidence: number;
  recovered_amount: number;
  retry_count: number;
  max_retries: number;
  requires_human_approval: boolean;
  diagnosis_summary?: string;
  rationale?: string;
  last_action?: string;
  last_action_result?: string;
  escalation_reason?: string;
  escalated_to?: string;
  created_at: string;
  updated_at: string;
  recovered_at?: string;
  ai_decision?: AIDecisionRecord;
}

export interface RecoveryLedgerRecord {
  id: string;
  case_id: string;
  customer_id: string;
  amount_at_risk: number;
  recovered_amount: number;
  currency: string;
  playbook: PlaybookType;
  verification_source: string;
  verified_at: string;
  idempotency_key: string;
}

export interface AuditRecord {
  id: string;
  case_id: string;
  timestamp: string;
  stage: 'DETECT' | 'DIAGNOSE' | 'DECIDE_PLAYBOOK' | 'CHECK_GUARDRAILS' | 'EXECUTE_ACTION' | 'VERIFY' | 'STOP_OR_ESCALATE';
  actor: string;
  action: string;
  result: 'SUCCESS' | 'FAILED' | 'ESCALATED' | 'BLOCKED' | 'NOT_RECOVERED' | 'DETECTED' | 'DIAGNOSED' | 'DECIDED' | 'GUARDRAIL_PASSED' | 'ACTION_EXECUTED' | 'SETTLEMENT_VERIFIED' | 'RECOVERED' | 'STOPPED';
  details: string;
  metadata?: Record<string, unknown>;
}

export interface EscalationRecord {
  id: string;
  case_id: string;
  customer_name: string;
  amount: number;
  playbook: PlaybookType;
  reason: string;
  risk_score: number;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'RESOLVED';
  assigned_to: string;
  created_at: string;
}

export interface PromiseRecord {
  id: string;
  case_id: string;
  customer_name: string;
  amount: number;
  promise_date: string;
  status: 'PROMISED' | 'RESCHEDULED' | 'UPCOMING' | 'DUE' | 'KEPT' | 'BROKEN' | 'ESCALATED';
  channel: string;
  created_at: string;
}

export interface GuardrailPolicy {
  maxRetries: number;
  cooldownHours: number;
  maxRiskScoreForAutonomousAction: number;
  highValueThreshold: number;
  dailyContactLimit: number;
  enableAssistedVoiceForEnterpriseOnly: boolean;
}

export class DatabaseService {
  private static instance: DatabaseService;
  private customers: Map<string, CustomerRecord> = new Map();
  private cases: Map<string, RecoveryCaseRecord> = new Map();
  private ledger: Map<string, RecoveryLedgerRecord> = new Map();
  private audits: AuditRecord[] = [];
  private escalations: Map<string, EscalationRecord> = new Map();
  private promises: Map<string, PromiseRecord> = new Map();
  private guardrails: GuardrailPolicy = { ...DEFAULT_GUARDRAILS };
  private isLoaded: boolean = false;

  private constructor() {
    if (!this.loadRuntimeState()) {
      this.seedFromCSV();
    }
  }

  public static getInstance(): DatabaseService {
    if (!DatabaseService.instance) {
      DatabaseService.instance = new DatabaseService();
    }
    return DatabaseService.instance;
  }

  private persistRuntimeState(): void {
    try {
      const dir = path.dirname(RUNTIME_STATE_FILE);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(RUNTIME_STATE_FILE, JSON.stringify({
        guardrails: this.guardrails,
        customers: Array.from(this.customers.values()),
        cases: Array.from(this.cases.values()),
        ledger: Array.from(this.ledger.values()),
        audits: this.audits,
        escalations: Array.from(this.escalations.values()),
        promises: Array.from(this.promises.values()),
      }));
    } catch (err) {
      console.warn('Runtime state persistence notice:', err);
    }
  }

  private loadRuntimeState(): boolean {
    try {
      if (!fs.existsSync(RUNTIME_STATE_FILE)) return false;
      const raw = fs.readFileSync(RUNTIME_STATE_FILE, 'utf8');
      if (!raw.trim()) return false;
      const parsed = JSON.parse(raw) as Partial<{
        guardrails: GuardrailPolicy;
        customers: CustomerRecord[];
        cases: RecoveryCaseRecord[];
        ledger: RecoveryLedgerRecord[];
        audits: AuditRecord[];
        escalations: EscalationRecord[];
        promises: PromiseRecord[];
      }>;
      if (parsed.guardrails) this.guardrails = parsed.guardrails;
      this.customers = new Map((parsed.customers || []).map(item => [item.id, item]));
      this.cases = new Map((parsed.cases || []).map(item => [item.id, item]));
      this.ledger = new Map((parsed.ledger || []).map(item => [item.id, item]));
      this.audits = parsed.audits || [];
      this.escalations = new Map((parsed.escalations || []).map(item => [item.id, item]));
      this.promises = new Map((parsed.promises || []).map(item => [item.id, item]));
      this.ensureRecoveredSettlements();
      return true;
    } catch (err) {
      console.warn('Runtime state load notice:', err);
      try {
        if (fs.existsSync(RUNTIME_STATE_FILE)) fs.unlinkSync(RUNTIME_STATE_FILE);
      } catch {
        // Ignore cleanup failures; seed loading can still proceed.
      }
      return false;
    }
  }

  public seedFromCSV(): void {
    try {
      const parseCSV = (filepath: string) => {
        if (!fs.existsSync(filepath)) return [];
        const content = fs.readFileSync(filepath, 'utf8');
        const lines = content.trim().split('\n');
        if (lines.length <= 1) return [];
        const splitRow = (str: string) => {
          const result: string[] = [];
          let cur = '';
          let inQuotes = false;
          for (let i = 0; i < str.length; i++) {
            const char = str[i];
            if (char === '"') {
              inQuotes = !inQuotes;
            } else if (char === ',' && !inQuotes) {
              result.push(cur.trim());
              cur = '';
            } else {
              cur += char;
            }
          }
          result.push(cur.trim());
          return result;
        };

        const headers = splitRow(lines[0]);
        return lines.slice(1).filter(l => l.trim().length > 0).map(line => {
          const vals = splitRow(line);
          const row: any = {};
          headers.forEach((h, idx) => {
            let v = vals[idx] || '';
            if (v.startsWith('"') && v.endsWith('"')) {
              v = v.slice(1, -1);
            }
            row[h] = v;
          });
          return row;
        });
      };

      const seedDir = path.join(process.cwd(), 'data/seed');
      
      // Load Customers
      const custRows = parseCSV(path.join(seedDir, 'customers.csv'));
      custRows.forEach(c => {
        this.customers.set(c.id, {
          id: c.id,
          name: c.name,
          email: c.email,
          phone: c.phone,
          segment: c.segment as any,
          lifetime_value: Number(c.lifetime_value) || 0,
          risk_score: Number(c.risk_score) || 0,
          past_recovery_rate: Number(c.past_recovery_rate) || 0,
          contact_preference: c.contact_preference,
          created_at: c.created_at
        });
      });

      // Load Cases
      const caseRows = parseCSV(path.join(seedDir, 'recovery_cases.csv'));
      caseRows.forEach(c => {
        this.cases.set(c.id, {
          id: c.id,
          customer_id: c.customer_id,
          customer_name: c.customer_name,
          customer_email: c.customer_email,
          customer_segment: c.customer_segment,
          customer_risk_score: Number(c.customer_risk_score) || 0,
          amount: Number(c.amount) || 0,
          currency: c.currency || 'INR',
          playbook: c.playbook as PlaybookType,
          failure_reason: c.failure_reason,
          status: c.status as any,
          current_step: c.current_step,
          recovery_confidence: Number(c.recovery_confidence) || 75,
          recovered_amount: Number(c.recovered_amount) || 0,
          retry_count: Number(c.retry_count) || 0,
          max_retries: Number(c.max_retries) || 3,
          requires_human_approval: c.requires_human_approval === '1' || c.requires_human_approval === 'true',
          diagnosis_summary: `Diagnosed root cause for ${c.playbook}. Risk score: ${c.customer_risk_score}/100.`,
          rationale: `Applied bounded playbook ${c.playbook} under guardrail compliance.`,
          last_action_result: c.status === 'RECOVERED' ? `Verified settlement of ₹${Number(c.amount).toLocaleString('en-IN')}` : undefined,
          created_at: c.created_at,
          updated_at: c.updated_at,
          recovered_at: c.recovered_at || undefined
        });
      });

      // Load Ledger
      const ledgerRows = parseCSV(path.join(seedDir, 'recovery_ledger.csv'));
      ledgerRows.forEach(l => {
        this.ledger.set(l.id, {
          id: l.id,
          case_id: l.case_id,
          customer_id: l.customer_id,
          amount_at_risk: Number(l.amount_at_risk) || 0,
          recovered_amount: Number(l.recovered_amount) || 0,
          currency: l.currency || 'INR',
          playbook: l.playbook as PlaybookType,
          verification_source: l.verification_source,
          verified_at: l.verified_at,
          idempotency_key: l.idempotency_key
        });
      });

      // Load Escalations
      const escRows = parseCSV(path.join(seedDir, 'escalations.csv'));
      escRows.forEach(e => {
        this.escalations.set(e.id, {
          id: e.id,
          case_id: e.case_id,
          customer_name: e.customer_name,
          amount: Number(e.amount) || 0,
          playbook: e.playbook as PlaybookType,
          reason: e.reason,
          risk_score: Number(e.risk_score) || 0,
          status: e.status as any,
          assigned_to: e.assigned_to,
          created_at: e.created_at
        });
      });

      // Load Promises
      const promRows = parseCSV(path.join(seedDir, 'promises.csv'));
      promRows.forEach(p => {
        this.promises.set(p.id, {
          id: p.id,
          case_id: p.case_id,
          customer_name: p.customer_name,
          amount: Number(p.amount) || 0,
          promise_date: p.promise_date,
          status: p.status as any,
          channel: p.channel,
          created_at: p.created_at
        });
      });

      // Hydrate recovered cases before audit classification so recovered seed
      // rows are evaluated against their canonical settlement state.
      this.hydrateRecoveredCasesFromState();

      // Load Audits. Older demo rows used FAILED for every non-successful
      // VERIFY/STOP_OR_ESCALATE stage. Reclassify those rows from the
      // persisted case and ledger state so expected outcomes remain distinct
      // from genuine execution failures.
      const auditRows = parseCSV(path.join(seedDir, 'audit_log.csv'));
      this.audits = auditRows.map(a => ({
        id: a.id,
        case_id: a.case_id,
        timestamp: a.timestamp,
        stage: a.stage as any,
        actor: a.actor
          .replace('RECOVER_AI_DIAGNOSTIC_MODEL', 'RECOVERAI_DIAGNOSTIC_RULES')
          .replace('RECOVER_AI_DECISION_SERVICE', 'RECOVERAI_DECISION_ENGINE')
          .replace('RECOVER_AI_ENGINE', 'RECOVERAI_AUTOMATION_ENGINE'),
        action: a.action,
        result: this.classifySeedAuditResult(a, this.cases.get(a.case_id)),
        details: a.details
      }));

      // Complete legacy seed case state from its audit record. The original
      // CSV cases predate last_action persistence, but the audit and ledger
      // records are the authoritative evidence for what actually happened.
      for (const recCase of this.cases.values()) {
        const caseAudits = this.audits.filter(a => a.case_id === recCase.id);
        if (caseAudits.some(a => a.stage === 'EXECUTE_ACTION')) {
          recCase.last_action = recCase.last_action || PLAYBOOK_CONFIGS[recCase.playbook]?.allowedActions[0];
        }
        if (!recCase.last_action_result && caseAudits.some(a => a.stage === 'VERIFY')) {
          recCase.last_action_result = recCase.status === 'RECOVERED'
            ? `Verified settlement of ₹${recCase.amount.toLocaleString('en-IN')}`
            : 'Provider response recorded; settlement pending verification.';
        }
      }

      // Cases are the queue's status source, while the ledger is the source
      // for verified revenue. Reconcile legacy/demo rows once at load time so
      // a recovered case can never exist without its settlement proof.
      this.ensureRecoveredSettlements();
      this.persistRuntimeState();

      this.isLoaded = true;
    } catch (err) {
      console.warn('CSV Seed Loading Notice:', err);
    }
  }

  private classifySeedAuditResult(
    row: { stage: string; result: string; action: string; details: string },
    recCase?: RecoveryCaseRecord,
  ): AuditRecord['result'] {
    if (!recCase) return row.result as AuditRecord['result'];

    const hasSettlement = recCase.status === 'RECOVERED'
      || this.ledgerHasCase(recCase.id);
    const isExplicitFailure = row.result === 'FAILED'
      && /error|exception|system failure|execution failure/i.test(`${row.action} ${row.details}`);
    if (row.stage === 'VERIFY') {
      if (isExplicitFailure) return 'FAILED';
      return hasSettlement ? 'SETTLEMENT_VERIFIED' : 'NOT_RECOVERED';
    }
    if (row.stage === 'STOP_OR_ESCALATE') {
      if (recCase.status === 'ESCALATED') return 'ESCALATED';
      if (recCase.status === 'RECOVERED') return 'RECOVERED';
      if (recCase.status.startsWith('STOPPED')) return 'STOPPED';
      if (isExplicitFailure) return 'FAILED';
      return 'STOPPED';
    }

    // Preserve FAILED only when the source explicitly describes an error.
    if (row.stage === 'DETECT') return 'DETECTED';
    if (row.stage === 'DIAGNOSE') return 'DIAGNOSED';
    if (row.stage === 'DECIDE_PLAYBOOK') return 'DECIDED';
    if (row.stage === 'CHECK_GUARDRAILS') return row.result === 'FAILED' ? (isExplicitFailure ? 'FAILED' : 'BLOCKED') : 'GUARDRAIL_PASSED';
    if (row.stage === 'EXECUTE_ACTION') return 'ACTION_EXECUTED';
    return row.result === 'FAILED' ? (isExplicitFailure ? 'FAILED' : 'BLOCKED') : row.result as AuditRecord['result'];
  }

  private ledgerHasCase(caseId: string): boolean {
    for (const entry of this.ledger.values()) {
      if (entry.case_id === caseId && entry.recovered_amount > 0) return true;
    }
    return false;
  }

  private getRawLedgerEntriesByCaseId(caseId?: string): RecoveryLedgerRecord[] {
    const entries = Array.from(this.ledger.values()).sort((a, b) => new Date(b.verified_at).getTime() - new Date(a.verified_at).getTime());
    return caseId ? entries.filter(entry => entry.case_id === caseId) : entries;
  }

  private getRawAuditsByCaseId(caseId: string): AuditRecord[] {
    return this.audits
      .filter(a => a.case_id === caseId)
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  }

  /**
   * One-time seed hydration that aligns recovered cases and ledger records
   * before audit classification runs.
   */
  private hydrateRecoveredCasesFromState(): void {
    for (const recCase of this.cases.values()) {
      const existingLedger = this.getRawLedgerEntriesByCaseId(recCase.id).find(entry => entry.recovered_amount > 0);
      const recoveredAmount = existingLedger?.recovered_amount || recCase.recovered_amount || 0;
      const hasRecoveredSignal = recCase.status === 'RECOVERED' || recoveredAmount > 0 || Boolean(existingLedger);
      if (!hasRecoveredSignal) continue;

      const settledAmount = recoveredAmount > 0
        ? recoveredAmount
        : recCase.status === 'RECOVERED'
          ? recCase.amount
          : 0;

      if (!existingLedger && settledAmount > 0) {
        this.ledger.set(`ledg_${recCase.id}_settlement`, {
          id: `ledg_${recCase.id}_settlement`,
          case_id: recCase.id,
          customer_id: recCase.customer_id,
          amount_at_risk: recCase.amount,
          recovered_amount: settledAmount,
          currency: recCase.currency || 'INR',
          playbook: recCase.playbook,
          verification_source: 'SEEDED_SETTLEMENT_VERIFIED',
          verified_at: recCase.recovered_at || recCase.updated_at,
          idempotency_key: `settlement_${recCase.id}`,
        });
      }

      recCase.status = 'RECOVERED';
      recCase.current_step = 'VERIFIED_STOPPED';
      recCase.recovered_amount = settledAmount;
      recCase.recovered_at = existingLedger?.verified_at || recCase.recovered_at || recCase.updated_at;
      recCase.last_action_result = `Settlement verified: ₹${settledAmount.toLocaleString('en-IN')} captured.`;
      this.cases.set(recCase.id, recCase);
    }
  }

  public getDashboardMetrics() {
    this.ensureRecoveredSettlements();
    const allCases = Array.from(this.cases.values());
    const ledgerEntries = Array.from(this.ledger.values());

    let totalRevenueAtRisk = 0;
    allCases.forEach(c => totalRevenueAtRisk += c.amount);

    // Sum strictly from recovery_ledger
    let totalRevenueRecovered = 0;
    ledgerEntries.forEach(l => totalRevenueRecovered += l.recovered_amount);

    let activeWorkflowsCount = 0;
    let resolvedCasesCount = 0;
    let escalatedCasesCount = 0;

    allCases.forEach(c => {
      if (c.status === 'RECOVERED') resolvedCasesCount += 1;
      else if (c.status === 'ESCALATED') escalatedCasesCount += 1;
      else if (c.status === 'ACTION_IN_PROGRESS' || c.status === 'DETECTED') activeWorkflowsCount += 1;
    });

    const recoveryRate = totalRevenueAtRisk > 0 
      ? Number(((totalRevenueRecovered / totalRevenueAtRisk) * 100).toFixed(1))
      : 0;

    // Playbook Distribution
    const playbookMap: Record<string, { atRisk: number; recovered: number; count: number; recoveredCount: number }> = {};
    Object.keys(PLAYBOOK_CONFIGS).forEach(pb => {
      playbookMap[pb] = { atRisk: 0, recovered: 0, count: 0, recoveredCount: 0 };
    });

    allCases.forEach(c => {
      if (!playbookMap[c.playbook]) {
        playbookMap[c.playbook] = { atRisk: 0, recovered: 0, count: 0, recoveredCount: 0 };
      }
      playbookMap[c.playbook].atRisk += c.amount;
      playbookMap[c.playbook].count += 1;
      if (c.status === 'RECOVERED') {
        playbookMap[c.playbook].recovered += c.recovered_amount;
        playbookMap[c.playbook].recoveredCount += 1;
      }
    });

    const playbookMetrics = Object.entries(playbookMap).map(([pb, stat]) => ({
      playbook: pb,
      displayName: PLAYBOOK_CONFIGS[pb as PlaybookType]?.displayName || pb,
      atRisk: stat.atRisk,
      recovered: stat.recovered,
      caseCount: stat.count,
      recoveredCount: stat.recoveredCount,
      escalatedCount: allCases.filter(c => c.playbook === pb && c.status === 'ESCALATED').length,
      stoppedCount: allCases.filter(c => c.playbook === pb && c.status.startsWith('STOPPED')).length,
      promiseToPayCount: Array.from(this.promises.values()).filter(p => allCases.some(c => c.id === p.case_id && c.playbook === pb)).length,
      recoveryRate: stat.atRisk > 0 ? Number(((stat.recovered / stat.atRisk) * 100).toFixed(1)) : 0
    }));

    return {
      totalRevenueAtRisk,
      totalRevenueRecovered,
      totalRecoverableRevenue: Math.round(totalRevenueAtRisk * 0.78),
      overallRecoveryRate: recoveryRate,
      activeWorkflowsCount,
      resolvedCasesCount,
      escalatedCasesCount,
      totalCasesCount: allCases.length,
      ledgerEntriesCount: ledgerEntries.length,
      playbookMetrics,
      recentRecoveries: ledgerEntries.slice(-6).reverse()
    };
  }

  public getCases(filters?: { playbook?: string; status?: string; search?: string }): RecoveryCaseRecord[] {
    this.ensureRecoveredSettlements();
    let result = Array.from(this.cases.values());
    if (filters?.playbook && filters.playbook !== 'ALL') {
      result = result.filter(c => c.playbook === filters.playbook);
    }
    if (filters?.status && filters.status !== 'ALL') {
      result = result.filter(c => c.status === filters.status);
    }
    if (filters?.search) {
      const q = filters.search.toLowerCase();
      result = result.filter(c => 
        c.id.toLowerCase().includes(q) ||
        c.customer_name.toLowerCase().includes(q) ||
        c.customer_email.toLowerCase().includes(q) ||
        c.failure_reason.toLowerCase().includes(q)
      );
    }
    return result.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
  }

  public getCaseById(id: string): RecoveryCaseRecord | undefined {
    this.ensureRecoveredSettlements();
    return this.cases.get(id);
  }

  public getAuditsByCaseId(caseId: string): AuditRecord[] {
    this.ensureRecoveredSettlements();
    return this.getRawAuditsByCaseId(caseId);
  }

  public getAllAudits(): AuditRecord[] {
    this.ensureRecoveredSettlements();
    return this.audits.slice(-100).reverse();
  }

  public getEscalations(): EscalationRecord[] {
    return Array.from(this.escalations.values()).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }

  public getPromises(): PromiseRecord[] {
    return Array.from(this.promises.values()).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }

  public getGuardrails(): GuardrailPolicy {
    return this.guardrails;
  }

  public updateGuardrails(policy: Partial<GuardrailPolicy>): GuardrailPolicy {
    const numericFields: Array<keyof GuardrailPolicy> = [
      'maxRetries',
      'cooldownHours',
      'maxRiskScoreForAutonomousAction',
      'highValueThreshold',
      'dailyContactLimit',
    ];
    for (const field of numericFields) {
      const value = policy[field];
      if (value !== undefined && (typeof value !== 'number' || !Number.isFinite(value))) {
        throw new Error(`${field} must be a finite number`);
      }
    }
    if (policy.maxRetries !== undefined && (!Number.isInteger(policy.maxRetries) || policy.maxRetries < 1 || policy.maxRetries > 10)) {
      throw new Error('maxRetries must be an integer between 1 and 10');
    }
    if (policy.cooldownHours !== undefined && (policy.cooldownHours < 0 || policy.cooldownHours > 24)) {
      throw new Error('cooldownHours must be between 0 and 24');
    }
    if (policy.maxRiskScoreForAutonomousAction !== undefined && (policy.maxRiskScoreForAutonomousAction < 0 || policy.maxRiskScoreForAutonomousAction > 100)) {
      throw new Error('maxRiskScoreForAutonomousAction must be between 0 and 100');
    }
    if (policy.highValueThreshold !== undefined && policy.highValueThreshold <= 0) {
      throw new Error('highValueThreshold must be greater than 0');
    }
    if (policy.dailyContactLimit !== undefined && (!Number.isInteger(policy.dailyContactLimit) || policy.dailyContactLimit < 1 || policy.dailyContactLimit > 50)) {
      throw new Error('dailyContactLimit must be an integer between 1 and 50');
    }
    if (policy.enableAssistedVoiceForEnterpriseOnly !== undefined && typeof policy.enableAssistedVoiceForEnterpriseOnly !== 'boolean') {
      throw new Error('enableAssistedVoiceForEnterpriseOnly must be boolean');
    }
    this.guardrails = { ...this.guardrails, ...policy };
    return this.guardrails;
  }

  public saveCase(c: RecoveryCaseRecord): void {
    c.updated_at = new Date().toISOString();
    this.cases.set(c.id, c);
    this.persistRuntimeState();
  }

  public addAudit(audit: AuditRecord): void {
    this.audits.push(audit);
    this.persistRuntimeState();
  }

  public addLedger(record: RecoveryLedgerRecord): void {
    // Idempotency is keyed by the business event, not the generated row id.
    // This protects refreshes, retries, and repeated simulator calls.
    const existing = Array.from(this.ledger.values()).find(entry =>
      entry.idempotency_key === record.idempotency_key ||
      (entry.case_id === record.case_id && entry.recovered_amount > 0)
    );
    if (existing) return;
    this.ledger.set(record.id, record);
    this.persistRuntimeState();
  }

  /** Establish the one canonical recovered-case state: case, proof, ledger, audit. */
  public settleCase(
    caseId: string,
    amount: number,
    verificationSource: string,
    verifiedAt = new Date().toISOString(),
  ): RecoveryLedgerRecord {
    const recCase = this.cases.get(caseId);
    if (!recCase) throw new Error(`Case ${caseId} not found`);
    const settledAmount = Math.max(0, amount || recCase.amount);
    if (settledAmount <= 0) throw new Error(`Cannot settle case ${caseId} with a zero amount`);

    const existing = this.getRawLedgerEntriesByCaseId(caseId).find(entry => entry.recovered_amount > 0);
    const ledgerEntry: RecoveryLedgerRecord = existing || {
      id: `ledg_${caseId}_settlement`,
      case_id: caseId,
      customer_id: recCase.customer_id,
      amount_at_risk: recCase.amount,
      recovered_amount: settledAmount,
      currency: recCase.currency || 'INR',
      playbook: recCase.playbook,
      verification_source: verificationSource,
      verified_at: verifiedAt,
      idempotency_key: `settlement_${caseId}`,
    };
    this.addLedger(ledgerEntry);

    const statusChanged = recCase.status !== 'RECOVERED';
    const stepChanged = recCase.current_step !== 'VERIFIED_STOPPED';
    const amountChanged = recCase.recovered_amount !== ledgerEntry.recovered_amount;
    const recoveredAtChanged = recCase.recovered_at !== ledgerEntry.verified_at;
    const resultText = `Settlement verified: ₹${ledgerEntry.recovered_amount.toLocaleString('en-IN')} captured.`;
    const resultChanged = recCase.last_action_result !== resultText;

    if (statusChanged) recCase.status = 'RECOVERED';
    if (stepChanged) recCase.current_step = 'VERIFIED_STOPPED';
    if (amountChanged) recCase.recovered_amount = ledgerEntry.recovered_amount;
    if (recoveredAtChanged) recCase.recovered_at = ledgerEntry.verified_at;
    if (resultChanged) recCase.last_action_result = resultText;
    if (statusChanged || stepChanged || amountChanged || recoveredAtChanged || resultChanged) {
      this.saveCase(recCase);
    }

    const hasVerificationAudit = this.getRawAuditsByCaseId(caseId).some(a =>
      a.stage === 'VERIFY' && (a.result === 'SUCCESS' || a.result === 'SETTLEMENT_VERIFIED')
    );
    if (!hasVerificationAudit) {
      this.addAudit({
        id: `aud_${caseId}_settlement_verified`,
        case_id: caseId,
        timestamp: ledgerEntry.verified_at,
        stage: 'VERIFY',
        actor: verificationSource.includes('PROMISE') ? 'PROMISE_TO_PAY_HANDLER' : 'RAZORPAY_WEBHOOK_HANDLER',
        action: 'SETTLEMENT_VERIFIED_AND_LEDGER_WRITTEN',
        result: 'SETTLEMENT_VERIFIED',
        details: `₹${ledgerEntry.recovered_amount.toLocaleString('en-IN')} verified and recorded in ledger (${ledgerEntry.id}).`,
      });
    }
    this.persistRuntimeState();
    return ledgerEntry;
  }

  private ensureRecoveredSettlements(): void {
    for (const recCase of this.cases.values()) {
      const existing = this.getRawLedgerEntriesByCaseId(recCase.id).find(entry => entry.recovered_amount > 0);
      if (recCase.status !== 'RECOVERED' && !existing && recCase.recovered_amount <= 0) continue;
      this.settleCase(
        recCase.id,
        existing?.recovered_amount || recCase.recovered_amount || recCase.amount,
        existing?.verification_source || 'SEEDED_SETTLEMENT_VERIFIED',
        existing?.verified_at || recCase.recovered_at || recCase.updated_at,
      );
    }
  }

  public addEscalation(esc: EscalationRecord): void {
    this.escalations.set(esc.id, esc);
    this.persistRuntimeState();
  }

  public addPromise(promise: PromiseRecord): void {
    this.promises.set(promise.id, promise);
    this.persistRuntimeState();
  }

  public getPromiseByCaseId(caseId: string): PromiseRecord | undefined {
    for (const prom of this.promises.values()) {
      if (prom.case_id === caseId) return prom;
    }
    return undefined;
  }

  public updatePromiseStatus(caseId: string, status: PromiseRecord['status']): void {
    for (const [id, prom] of this.promises.entries()) {
      if (prom.case_id === caseId) {
        prom.status = status;
        this.promises.set(id, prom);
      }
    }
    this.persistRuntimeState();
  }

  public getCustomerById(id: string): CustomerRecord | undefined {
    return this.customers.get(id);
  }

  public getLedgerEntries(): RecoveryLedgerRecord[] {
    this.ensureRecoveredSettlements();
    return this.getRawLedgerEntriesByCaseId();
  }

  public getLedgerEntriesByCaseId(caseId?: string): RecoveryLedgerRecord[] {
    this.ensureRecoveredSettlements();
    return this.getRawLedgerEntriesByCaseId(caseId);
  }

  public resolveEscalation(caseId: string, status: 'APPROVED' | 'REJECTED'): void {
    for (const [id, esc] of this.escalations.entries()) {
      if (esc.case_id === caseId) {
        esc.status = status;
        this.escalations.set(id, esc);
      }
    }
    this.persistRuntimeState();
  }

  public resetToSeed(): void {
    this.customers.clear();
    this.cases.clear();
    this.ledger.clear();
    this.audits = [];
    this.escalations.clear();
    this.promises.clear();
    this.guardrails = { ...DEFAULT_GUARDRAILS };
    this.seedFromCSV();
    try {
      if (fs.existsSync(RUNTIME_STATE_FILE)) fs.unlinkSync(RUNTIME_STATE_FILE);
    } catch (err) {
      console.warn('Runtime state reset notice:', err);
    }
  }
}

export const db = DatabaseService.getInstance();
