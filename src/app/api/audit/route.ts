import { NextResponse, NextRequest } from 'next/server';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const caseId  = searchParams.get('case_id')  || undefined;
  const stage   = searchParams.get('stage')     || undefined;
  const limit   = Math.min(parseInt(searchParams.get('limit') || '200', 10), 500);
  const offset  = parseInt(searchParams.get('offset') || '0', 10);

  let audits = caseId
    ? db.getAuditsByCaseId(caseId)
    : db.getAllAudits();

  // Optional stage filter
  if (stage && stage !== 'ALL') {
    audits = audits.filter(a => a.stage === stage);
  }

  // Pagination
  const total = audits.length;
  const page  = audits.slice(offset, offset + limit);

  // Enrich with case customer info where possible
  const enriched = page.map(a => {
    const recCase = db.getCaseById(a.case_id);
    return {
      ...a,
      customer_name: recCase?.customer_name  ?? 'Unknown',
      amount:        recCase?.amount         ?? 0,
      playbook:      recCase?.playbook       ?? '',
    };
  });

  return NextResponse.json({ audits: enriched, total, limit, offset });
}
