import fs from 'fs';
import path from 'path';
import { PlaybookType, PLAYBOOK_CONFIGS } from '../playbooks';

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
  result: 'SUCCESS' | 'FAILED' | 'ESCALATED' | 'BLOCKED';
  details: string;
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
  status: 'PROMISED' | 'UPCOMING' | 'DUE' | 'KEPT' | 'BROKEN' | 'ESCALATED';
  channel: string;
  created_at: string;
}

export interface GuardrailPolicy {
  maxRetries: number;
  cooldownHours: number;
  maxRiskScoreForAutonomousAction: number;
  highValueThreshold: number;
  dailyContactLimit: number;
  enableVoiceAiForEnterpriseOnly: boolean;
}

export class DatabaseService {
  private static instance: DatabaseService;
  private customers: Map<string, CustomerRecord> = new Map();
  private cases: Map<string, RecoveryCaseRecord> = new Map();
  private ledger: Map<string, RecoveryLedgerRecord> = new Map();
  private audits: AuditRecord[] = [];
  private escalations: Map<string, EscalationRecord> = new Map();
  private promises: Map<string, PromiseRecord> = new Map();
  private guardrails: GuardrailPolicy = {
    maxRetries: 3,
    cooldownHours: 0.25,
    maxRiskScoreForAutonomousAction: 65,
    highValueThreshold: 100000,
    dailyContactLimit: 2,
    enableVoiceAiForEnterpriseOnly: false
  };
  private isLoaded: boolean = false;

  private constructor() {
    this.seedFromCSV();
  }

  public static getInstance(): DatabaseService {
    if (!DatabaseService.instance) {
      DatabaseService.instance = new DatabaseService();
    }
    return DatabaseService.instance;
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

      // Load Audits
      const auditRows = parseCSV(path.join(seedDir, 'audit_log.csv'));
      this.audits = auditRows.map(a => ({
        id: a.id,
        case_id: a.case_id,
        timestamp: a.timestamp,
        stage: a.stage as any,
        actor: a.actor,
        action: a.action,
        result: a.result as any,
        details: a.details
      }));

      this.isLoaded = true;
    } catch (err) {
      console.warn('CSV Seed Loading Notice:', err);
    }
  }

  public getDashboardMetrics() {
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
    return this.cases.get(id);
  }

  public getAuditsByCaseId(caseId: string): AuditRecord[] {
    return this.audits.filter(a => a.case_id === caseId).sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  }

  public getAllAudits(): AuditRecord[] {
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
    this.guardrails = { ...this.guardrails, ...policy };
    return this.guardrails;
  }

  public saveCase(c: RecoveryCaseRecord): void {
    c.updated_at = new Date().toISOString();
    this.cases.set(c.id, c);
  }

  public addAudit(audit: AuditRecord): void {
    this.audits.push(audit);
  }

  public addLedger(record: RecoveryLedgerRecord): void {
    this.ledger.set(record.id, record);
  }

  public addEscalation(esc: EscalationRecord): void {
    this.escalations.set(esc.id, esc);
  }

  public addPromise(promise: PromiseRecord): void {
    this.promises.set(promise.id, promise);
  }

  public updatePromiseStatus(caseId: string, status: PromiseRecord['status']): void {
    for (const [id, prom] of this.promises.entries()) {
      if (prom.case_id === caseId) {
        prom.status = status;
        this.promises.set(id, prom);
      }
    }
  }

  public getPromiseByCaseId(caseId: string): PromiseRecord | undefined {
    for (const prom of this.promises.values()) {
      if (prom.case_id === caseId) return prom;
    }
    return undefined;
  }

  public getCustomerById(id: string): CustomerRecord | undefined {
    return this.customers.get(id);
  }

  public getLedgerEntries(): RecoveryLedgerRecord[] {
    return Array.from(this.ledger.values());
  }

  public resolveEscalation(caseId: string, status: 'APPROVED' | 'REJECTED'): void {
    for (const [id, esc] of this.escalations.entries()) {
      if (esc.case_id === caseId) {
        esc.status = status;
        this.escalations.set(id, esc);
      }
    }
  }

  public resetToSeed(): void {
    this.customers.clear();
    this.cases.clear();
    this.ledger.clear();
    this.audits = [];
    this.escalations.clear();
    this.promises.clear();
    this.seedFromCSV();
  }
}

export const db = DatabaseService.getInstance();
