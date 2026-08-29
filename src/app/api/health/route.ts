import { NextResponse } from 'next/server';
import { RazorpayService } from '@/lib/razorpay-adapter';
import { getGeminiHealth } from '@/lib/ai-gemini';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({
    status: 'healthy',
    service: 'RecoverAI — AI-Assisted Revenue Recovery Platform',
    timestamp: new Date().toISOString(),
    razorpayIntegration: {
      mode: RazorpayService.getMode(),
      configured: RazorpayService.isConfigured()
    },
    services: {
      recoveryEngine: { status: 'HEALTHY' },
      audit: { status: 'HEALTHY' },
      gemini: getGeminiHealth(),
    },
  });
}
