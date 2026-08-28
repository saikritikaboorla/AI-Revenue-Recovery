import { NextResponse, NextRequest } from 'next/server';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  await db.ensureDurableState();
  const { searchParams } = new URL(req.url);
  const status = searchParams.get('status') || undefined;
  const playbook = searchParams.get('playbook') || undefined;
  const search = searchParams.get('search') || undefined;

  const cases = db.getCases({ status, playbook, search });
  return NextResponse.json({
    cases,
    total: cases.length
  });
}

export async function DELETE() {
  await db.ensureDurableState();
  db.resetToSeed();
  await db.flushDurableState(true);
  return NextResponse.json({ success: true, message: 'Database reset to verified seed CSV state' });
}
