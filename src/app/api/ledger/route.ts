import { NextResponse, NextRequest } from 'next/server';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const caseId = searchParams.get('case_id') || undefined;
  const entries = db.getLedgerEntriesByCaseId(caseId);
  return NextResponse.json({
    entries,
    totalRecovered: entries.reduce((sum, entry) => sum + entry.recovered_amount, 0),
    successfulRecoveries: entries.length,
  });
}
