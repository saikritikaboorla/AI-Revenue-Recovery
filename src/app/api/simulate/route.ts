import { NextResponse, NextRequest } from 'next/server';
import { SimulationEngine } from '@/lib/simulation-engine';
import { errorMessage, isRecord, optionalFiniteNumber } from '@/lib/api-validation';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    if (!isRecord(body)) throw new Error('A JSON object is required');
    const requestedSize = optionalFiniteNumber(body.batchSize, 'batchSize') ?? 10;
    if (!Number.isInteger(requestedSize) || requestedSize < 1 || requestedSize > 100) {
      throw new Error('batchSize must be an integer between 1 and 100');
    }
    const batchSize = requestedSize;
    const result = await SimulationEngine.runBatchSimulation({ batchSize });
    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json({ error: errorMessage(err, 'Batch simulation failed') }, { status: 400 });
  }
}
