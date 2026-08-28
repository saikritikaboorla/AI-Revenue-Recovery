import { NextResponse, NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { errorMessage, isRecord } from '@/lib/api-validation';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json(db.getGuardrails());
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    if (!isRecord(body)) {
      return NextResponse.json({ error: 'A JSON object is required' }, { status: 400 });
    }
    const updated = db.updateGuardrails(body as Partial<Parameters<typeof db.updateGuardrails>[0]>);
    return NextResponse.json({ success: true, guardrails: updated });
  } catch (err: any) {
    return NextResponse.json({ error: errorMessage(err, 'Failed to update guardrails') }, { status: 400 });
  }
}
