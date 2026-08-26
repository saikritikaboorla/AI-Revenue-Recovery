import { NextResponse, NextRequest } from 'next/server';
import { RecoveryPipeline } from '@/lib/playbooks/engine';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const batchSize = body?.batchSize || 10;
    const playbookFilter = body?.playbookFilter;
    const result = await RecoveryPipeline.runBatch({ batchSize, playbookFilter });
    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Batch simulation failed' }, { status: 400 });
  }
}
