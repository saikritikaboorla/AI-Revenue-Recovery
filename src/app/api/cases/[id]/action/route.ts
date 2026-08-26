import { NextResponse, NextRequest } from 'next/server';
import { RecoveryPipeline } from '@/lib/playbooks/engine';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const body = await request.json().catch(() => ({}));
    const forceApproval = body?.forceApproval === true;
    const result = await RecoveryPipeline.processCase(id, { forceApproval });
    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Workflow execution failed' }, { status: 400 });
  }
}
