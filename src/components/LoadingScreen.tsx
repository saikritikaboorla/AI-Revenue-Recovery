'use client';

import React, { useEffect, useState, useRef } from 'react';

interface LoadingScreenProps {
  loading: boolean;
}

const MESSAGES = [
  'INITIALIZING REVENUE RECOVERY',
  'ANALYZING PAYMENT SIGNALS',
  'LOADING RECOVERY ENGINE',
  'VERIFYING RECOVERY PIPELINE',
] as const;

export const LoadingScreen: React.FC<LoadingScreenProps> = ({ loading: externalLoading }) => {
  const [visible, setVisible] = useState(true);
  const [fadeOut, setFadeOut] = useState(false);
  const [msgIndex, setMsgIndex] = useState(0);
  const [msgVisible, setMsgVisible] = useState(true);
  const autoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const msgTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Determine whether we should be loading (respect external prop, auto-complete at 3s)
  const [internalLoading, setInternalLoading] = useState(true);

  useEffect(() => {
    // Auto-complete after 3 seconds regardless of prop
    autoTimerRef.current = setTimeout(() => {
      setInternalLoading(false);
    }, 3000);

    return () => {
      if (autoTimerRef.current) clearTimeout(autoTimerRef.current);
    };
  }, []);

  const shouldShow = externalLoading && internalLoading;

  // Cycle messages every 1.2s with fade
  useEffect(() => {
    if (!shouldShow) return;

    msgTimerRef.current = setInterval(() => {
      // Fade out current message
      setMsgVisible(false);
      setTimeout(() => {
        setMsgIndex((prev) => (prev + 1) % MESSAGES.length);
        setMsgVisible(true);
      }, 200);
    }, 1200);

    return () => {
      if (msgTimerRef.current) clearInterval(msgTimerRef.current);
    };
  }, [shouldShow]);

  // Handle fade-out when loading ends
  useEffect(() => {
    if (!shouldShow && visible) {
      setFadeOut(true);
      const t = setTimeout(() => setVisible(false), 600);
      return () => clearTimeout(t);
    }
  }, [shouldShow, visible]);

  if (!visible) return null;

  return (
    <div
      aria-label="Loading RecoverAI"
      role="status"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#070A10',
        opacity: fadeOut ? 0 : 1,
        transition: 'opacity 0.6s ease',
        pointerEvents: fadeOut ? 'none' : 'all',
      }}
    >
      {/* Animated Technical Square */}
      <div style={{ position: 'relative', width: 64, height: 64, marginBottom: 28 }}>
        {/* Rotating outer ring */}
        <div
          style={{
            position: 'absolute',
            inset: -4,
            borderRadius: 4,
            border: '1px solid rgba(59,130,246,0.2)',
            animation: 'ls-orbit 6s linear infinite',
          }}
        />

        {/* Main square — rotation + scale pulse */}
        <div
          style={{
            width: 64,
            height: 64,
            position: 'relative',
            animation: 'ls-spin-pulse 3s ease-in-out infinite',
            border: '1px solid rgba(59,130,246,0.5)',
            borderRadius: 4,
            backgroundColor: 'rgba(59,130,246,0.04)',
            boxShadow: '0 0 18px rgba(59,130,246,0.18), inset 0 0 10px rgba(59,130,246,0.06)',
          }}
        >
          {/* Fine grid lines via SVG */}
          <svg
            width="64"
            height="64"
            style={{ position: 'absolute', inset: 0 }}
            aria-hidden="true"
          >
            {/* Vertical lines */}
            {[16, 32, 48].map((x) => (
              <line
                key={`v${x}`}
                x1={x}
                y1={0}
                x2={x}
                y2={64}
                stroke="rgba(59,130,246,0.15)"
                strokeWidth="0.5"
              />
            ))}
            {/* Horizontal lines */}
            {[16, 32, 48].map((y) => (
              <line
                key={`h${y}`}
                x1={0}
                y1={y}
                x2={64}
                y2={y}
                stroke="rgba(59,130,246,0.15)"
                strokeWidth="0.5"
              />
            ))}
            {/* Center crosshair */}
            <line x1={32} y1={28} x2={32} y2={36} stroke="rgba(59,130,246,0.5)" strokeWidth="0.8" />
            <line x1={28} y1={32} x2={36} y2={32} stroke="rgba(59,130,246,0.5)" strokeWidth="0.8" />
            {/* Center dot */}
            <circle cx={32} cy={32} r={1.5} fill="rgba(59,130,246,0.8)" />
          </svg>

          {/* Corner brackets */}
          {/* Top-left */}
          <span style={{
            position: 'absolute', top: -1, left: -1,
            width: 10, height: 10,
            borderTop: '2px solid #3B82F6',
            borderLeft: '2px solid #3B82F6',
            borderRadius: '2px 0 0 0',
          }} />
          {/* Top-right */}
          <span style={{
            position: 'absolute', top: -1, right: -1,
            width: 10, height: 10,
            borderTop: '2px solid #3B82F6',
            borderRight: '2px solid #3B82F6',
            borderRadius: '0 2px 0 0',
          }} />
          {/* Bottom-left */}
          <span style={{
            position: 'absolute', bottom: -1, left: -1,
            width: 10, height: 10,
            borderBottom: '2px solid #3B82F6',
            borderLeft: '2px solid #3B82F6',
            borderRadius: '0 0 0 2px',
          }} />
          {/* Bottom-right */}
          <span style={{
            position: 'absolute', bottom: -1, right: -1,
            width: 10, height: 10,
            borderBottom: '2px solid #3B82F6',
            borderRight: '2px solid #3B82F6',
            borderRadius: '0 0 2px 0',
          }} />
        </div>
      </div>

      {/* Cycling status message */}
      <div style={{ height: 20, marginBottom: 20, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p
          style={{
            fontFamily: 'var(--font-geist-mono, "GeistMono", "JetBrains Mono", ui-monospace, monospace)',
            fontSize: 10,
            letterSpacing: '0.18em',
            color: '#3B82F6',
            textTransform: 'uppercase',
            margin: 0,
            opacity: msgVisible ? 1 : 0,
            transition: 'opacity 0.2s ease',
          }}
        >
          {MESSAGES[msgIndex]}
        </p>
      </div>

      {/* RecoverAI logo */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
        <span style={{
          fontFamily: 'var(--font-geist-sans, system-ui, sans-serif)',
          fontSize: 18,
          fontWeight: 700,
          letterSpacing: '-0.01em',
          color: '#F0F4FF',
        }}>
          RecoverAI
        </span>
        <span style={{
          fontFamily: 'var(--font-geist-mono, ui-monospace, monospace)',
          fontSize: 9,
          letterSpacing: '0.22em',
          color: '#5A6478',
          textTransform: 'uppercase',
        }}>
          AI Revenue Recovery
        </span>
      </div>

      {/* Progress bar */}
      <div style={{
        marginTop: 32,
        width: 120,
        height: 2,
        backgroundColor: 'rgba(59,130,246,0.1)',
        borderRadius: 2,
        overflow: 'hidden',
      }}>
        <div style={{
          height: '100%',
          backgroundColor: '#3B82F6',
          animation: 'ls-progress 3s ease-out forwards',
          boxShadow: '0 0 8px rgba(59,130,246,0.5)',
        }} />
      </div>

      {/* Keyframes injected inline */}
      <style>{`
        @keyframes ls-spin-pulse {
          0%   { transform: rotate(0deg) scale(1); }
          25%  { transform: rotate(90deg) scale(1.06); }
          50%  { transform: rotate(180deg) scale(1); }
          75%  { transform: rotate(270deg) scale(1.06); }
          100% { transform: rotate(360deg) scale(1); }
        }
        @keyframes ls-orbit {
          0%   { transform: rotate(0deg); opacity: 0.4; }
          50%  { opacity: 1; }
          100% { transform: rotate(-360deg); opacity: 0.4; }
        }
        @keyframes ls-progress {
          0%   { width: 0%; }
          20%  { width: 35%; }
          50%  { width: 62%; }
          80%  { width: 88%; }
          100% { width: 100%; }
        }
      `}</style>
    </div>
  );
};

export default LoadingScreen;
