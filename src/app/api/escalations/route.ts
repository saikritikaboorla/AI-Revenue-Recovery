import { NextResponse, NextRequest } from 'next/server';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  const escalations = db.getEscalations();
  return NextResponse.json({ escalations, total: escalations.length });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { caseId, action } = body; // action: 'APPROVE' | 'REJECT'
    if (!caseId || !action) {
      return NextResponse.json({ error: 'caseId and action (APPROVE|REJECT) required' }, { status: 400 });
    }
    db.resolveEscalation(caseId, action === 'APPROVE' ? 'APPROVED' : 'REJECTED');
    const recCase = db.getCaseById(caseId);
    if (recCase) {
      if (action === 'APPROVE') {
        recCase.requires_human_approval = false;
        recCase.status = 'ACTION_IN_PROGRESS';
      } else {
        recCase.status = 'STOPPED_UNRECOVERABLE';
      }
      db.saveCase(recCase);
    }
    return NextResponse.json({ success: true, caseId, action });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Failed to update escalation' }, { status: 400 });
  }
}
