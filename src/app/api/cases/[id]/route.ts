import { NextResponse, NextRequest } from 'next/server';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  await db.ensureDurableState();
  const { id } = await params;
  const recCase = db.getCaseById(id);
  if (!recCase) {
    return NextResponse.json({ error: 'Case not found' }, { status: 404 });
  }
  const audits = db.getAuditsByCaseId(id);
  return NextResponse.json({ case: recCase, audits });
}
