import { NextResponse, NextRequest } from 'next/server';
import { RecoveryPipeline } from '@/lib/playbooks/engine';
import { db } from '@/lib/db';
import { errorMessage, isRecord } from '@/lib/api-validation';

export const dynamic = 'force-dynamic';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    await db.ensureDurableState();
    const body = await request.json().catch(() => ({}));
    if (!isRecord(body)) throw new Error('A JSON object is required');
    const forceApproval = body.forceApproval === true;
    const result = await RecoveryPipeline.processCase(id, { forceApproval });
    await db.flushDurableState();
    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json({ error: errorMessage(err, 'Workflow execution failed') }, { status: 400 });
  }
}
