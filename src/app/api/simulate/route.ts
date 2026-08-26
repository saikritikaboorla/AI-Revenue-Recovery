import { NextResponse, NextRequest } from 'next/server';
import { SimulationEngine } from '@/lib/simulation-engine';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const batchSize = Math.min(Math.max(body?.batchSize || 10, 1), 100);
    const result = await SimulationEngine.runBatchSimulation({ batchSize });
    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Batch simulation failed' }, { status: 400 });
  }
}
