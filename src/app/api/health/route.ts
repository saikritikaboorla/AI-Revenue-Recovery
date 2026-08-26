import { NextResponse } from 'next/server';
import { RazorpayService } from '@/lib/razorpay-adapter';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({
    status: 'healthy',
    service: 'RecoverAI — AI Revenue Recovery Platform',
    timestamp: new Date().toISOString(),
    razorpayIntegration: {
      mode: RazorpayService.getMode(),
      configured: RazorpayService.isConfigured()
    }
  });
}
