"use client";

import React, { useEffect } from 'react';
import Link from 'next/link';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Captured runtime error:', error);
  }, [error]);

  return (
    <div className="min-h-screen bg-[#080B12] flex items-center justify-center p-6 text-[#F5F7FA]">
      <div className="max-w-md w-full rounded-2xl border border-[#252D3A] bg-[#141A24] p-8 text-center space-y-6 shadow-2xl">
        <div className="h-12 w-12 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-400 flex items-center justify-center mx-auto">
          <AlertTriangle className="h-6 w-6" />
        </div>

        <div>
          <h2 className="text-xl font-bold text-[#F5F7FA]">Command Center Recovery Active</h2>
          <p className="text-xs text-[#98A2B3] mt-1.5">
            A temporary component state exception occurred. The underlying FinTech database and agent engine remain healthy.
          </p>
        </div>

        <div className="flex items-center justify-center gap-3">
          <button
            onClick={() => reset()}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-xs font-bold text-white transition-all shadow-[0_0_15px_rgba(59,130,246,0.3)] cursor-pointer"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Retry View
          </button>
          <Link
            href="/"
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-[#252D3A] bg-[#10151F] text-xs font-semibold text-[#98A2B3] hover:text-[#F5F7FA] transition-all cursor-pointer"
          >
            <Home className="h-3.5 w-3.5" />
            Home
          </Link>
        </div>
      </div>
    </div>
  );
}
