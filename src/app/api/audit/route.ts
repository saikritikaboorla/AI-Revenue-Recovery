import { NextResponse, NextRequest } from 'next/server';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    await db.ensureDurableState();
    const { searchParams } = new URL(req.url);
    const caseId = searchParams.get('case_id') || undefined;
    const stage = searchParams.get('stage') || undefined;
    const requestedLimit = Number.parseInt(searchParams.get('limit') || '200', 10);
    const limit = Number.isFinite(requestedLimit) ? Math.min(Math.max(requestedLimit, 1), 10000) : 200;
    const requestedOffset = Number.parseInt(searchParams.get('offset') || '0', 10);
    const offset = Number.isFinite(requestedOffset) ? Math.max(requestedOffset, 0) : 0;

    let audits = caseId ? db.getAuditsByCaseId(caseId) : db.getAllAudits();
    if (stage && stage !== 'ALL') audits = audits.filter(a => a.stage === stage);
    const total = audits.length;
    const page = audits.slice(offset, offset + limit);
    const enriched = page.map(a => {
      const recCase = db.getCaseById(a.case_id);
      return { ...a, customer_name: recCase?.customer_name ?? 'Unknown', amount: recCase?.amount ?? 0, playbook: recCase?.playbook ?? '' };
    });
    return NextResponse.json({ audits: enriched, total, limit, offset });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to load audit events' }, { status: 500 });
  }
}
