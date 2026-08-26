import { NextResponse, NextRequest } from 'next/server';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json(db.getGuardrails());
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const updated = db.updateGuardrails(body);
    return NextResponse.json({ success: true, guardrails: updated });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Failed to update guardrails' }, { status: 400 });
  }
}
