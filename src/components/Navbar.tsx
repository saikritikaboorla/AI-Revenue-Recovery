'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  Zap,
  Activity,
  Layers,
  BarChart3,
  PlayCircle,
  AlertTriangle,
  ShieldCheck,
  History,
  Radio,
  HandCoins,
  Menu,
  X,
  ChevronRight,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface NavItem {
  label: string;
  /** Full href — used for Link fallback & routing */
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  /** Hash fragment (no #) — when set, clicking uses shallow hash push */
  hash?: string;
}

// ─── Nav items ────────────────────────────────────────────────────────────────

const NAV_ITEMS: NavItem[] = [
  { label: 'Overview',        href: '/',                     icon: Layers },
  { label: 'Command Center',  href: '/dashboard',            icon: Activity,      hash: 'overview' },
  { label: 'Recovery Queue',  href: '/dashboard#queue',      icon: Radio,         hash: 'queue' },
  { label: 'Analytics',       href: '/dashboard#analytics',  icon: BarChart3,     hash: 'analytics' },
  { label: 'Batch Simulator', href: '/dashboard#simulation', icon: PlayCircle,    hash: 'simulation' },
  { label: 'Escalations',     href: '/dashboard#escalations',icon: AlertTriangle, hash: 'escalations' },
  { label: 'Promise-to-Pay',  href: '/dashboard#promises',   icon: HandCoins,     hash: 'promises' },
  { label: 'Guardrails',      href: '/dashboard#guardrails', icon: ShieldCheck,   hash: 'guardrails' },
  { label: 'Audit',           href: '/dashboard#audit',      icon: History,       hash: 'audit' },
];

// ─── Hook: track URL hash client-side ────────────────────────────────────────

function useHash(): string {
  const [hash, setHash] = useState('');

  useEffect(() => {
    const updateHash = () => setHash(window.location.hash.replace('#', ''));
    updateHash();
    window.addEventListener('hashchange', updateHash);
    return () => window.removeEventListener('hashchange', updateHash);
  }, []);

  return hash;
}

// ─── Active-state helper ──────────────────────────────────────────────────────

function isItemActive(item: NavItem, pathname: string, hash: string): boolean {
  if (pathname === '/') return item.href === '/';
  if (pathname === '/dashboard') {
    if (!hash || hash === 'overview') {
      return item.hash === 'overview' || item.label === 'Command Center';
    }
    return item.hash === hash;
  }
  return false;
}

// ─── Component ────────────────────────────────────────────────────────────────

export const Navbar: React.FC = () => {
  const pathname = usePathname();
  const router = useRouter();
  const hash = useHash();
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => { setMobileOpen(false); }, [pathname, hash]);

  useEffect(() => {
    if (mobileOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [mobileOpen]);

  const handleNavClick = useCallback(
    (e: React.MouseEvent, item: NavItem) => {
      if (item.href === '/') {
        // Normal link navigation to home
        return;
      }

      e.preventDefault();
      const targetHash = item.hash || '';

      if (pathname === '/dashboard') {
        if (!targetHash || targetHash === 'overview') {
          // Reset hash to overview or clear it
          window.location.hash = 'overview';
        } else {
          window.location.hash = targetHash;
        }
      } else {
        if (!targetHash || targetHash === 'overview') {
          router.push('/dashboard#overview');
        } else {
          router.push(`/dashboard#${targetHash}`);
        }
      }
      setMobileOpen(false);
    },
    [pathname, router]
  );

  return (
    <>
      <header className="sticky top-0 z-50 w-full border-b border-[#1E2A3A] bg-[#070A10]/90 backdrop-blur-md">
        <div className="w-full max-w-[1920px] mx-auto flex h-16 items-center justify-between px-4 sm:px-6 lg:px-8 gap-2 sm:gap-4">

          {/* ── 1. Left: Brand / Logo ─────────────────────────────────── */}
          <div className="flex items-center shrink-0">
            <Link href="/" className="flex items-center gap-2.5 group" aria-label="RecoverAI Home">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600/20 border border-blue-500/40 text-blue-400 group-hover:border-blue-400 group-hover:bg-blue-600/30 transition-all duration-200 shadow-[0_0_12px_rgba(59,130,246,0.2)] shrink-0">
                <Zap className="h-4 w-4" />
              </div>
              <div className="flex flex-col leading-none">
                <span className="text-sm font-bold tracking-tight text-[#F0F4FF] group-hover:text-blue-400 transition-colors duration-200">
                  RecoverAI
                </span>
                <span className="text-[9px] tracking-widest uppercase font-medium text-[#5A6478] mt-0.5">
                  Deterministic Revenue Recovery
                </span>
              </div>
            </Link>
          </div>

          {/* ── 2. Center: Flexible Desktop Nav Links ─────────────────── */}
          <nav className="hidden xl:flex flex-1 min-w-0 items-center justify-center gap-0.5 2xl:gap-1 px-1 2xl:px-3" aria-label="Primary navigation">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const active = isItemActive(item, pathname, hash);
              return (
                <Link
                  key={item.label}
                  href={item.href}
                  onClick={(e) => handleNavClick(e, item)}
                  className={[
                    'flex items-center gap-1.5 px-2 2xl:px-2.5 py-1.5 rounded-md text-[11px] 2xl:text-xs font-medium transition-all duration-150 shrink-0',
                    active
                      ? 'bg-blue-600/15 text-blue-400 border border-blue-500/30 shadow-[0_0_8px_rgba(59,130,246,0.15)]'
                      : 'text-[#8B98B0] hover:text-[#F0F4FF] hover:bg-[#10151F] border border-transparent',
                  ].join(' ')}
                  aria-current={active ? 'page' : undefined}
                >
                  <Icon className="h-3 w-3 shrink-0" />
                  <span className="whitespace-nowrap">{item.label}</span>
                </Link>
              );
            })}
          </nav>

          {/* ── 3. Right: Status & Action Controls (Fixed Priority) ──── */}
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            {/* Live Engine Status Badge */}
            <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-950/50 border border-emerald-500/25 text-emerald-400 shrink-0">
              <span className="relative flex h-2 w-2 shrink-0">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400" />
              </span>
              <span className="text-[10px] font-mono font-medium whitespace-nowrap">Recovery Engine Live</span>
            </div>

            {/* Launch CTA */}
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 hover:bg-blue-500 active:bg-blue-700 px-3 sm:px-3.5 py-2 text-xs font-semibold text-white transition-all duration-150 shadow-[0_0_16px_rgba(59,130,246,0.35)] hover:shadow-[0_0_22px_rgba(59,130,246,0.55)] whitespace-nowrap cursor-pointer shrink-0"
            >
              <Activity className="h-4 w-4 shrink-0 text-white" />
              <span className="hidden sm:inline">Open Command Center</span>
              <span className="sm:hidden">Command Center</span>
            </Link>

            {/* Mobile Hamburger Toggle */}
            <button
              type="button"
              className="xl:hidden flex items-center justify-center h-9 w-9 rounded-lg border border-[#1E2A3A] bg-[#0D1117] text-[#8B98B0] hover:text-[#F0F4FF] hover:border-[#243040] transition-all duration-150 cursor-pointer shrink-0"
              onClick={() => setMobileOpen((v) => !v)}
              aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
              aria-expanded={mobileOpen}
            >
              {mobileOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
            </button>
          </div>
        </div>
      </header>

      {/* ── Mobile backdrop ──────────────────────────────────────────────────── */}
      <div
        className={[
          'fixed inset-0 z-40 bg-black/50 backdrop-blur-sm xl:hidden transition-opacity duration-200',
          mobileOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none',
        ].join(' ')}
        aria-hidden="true"
        onClick={() => setMobileOpen(false)}
      />

      {/* ── Mobile drawer ────────────────────────────────────────────────────── */}
      <div
        className={[
          'fixed top-14 left-0 right-0 z-40 xl:hidden transition-all duration-200 origin-top',
          mobileOpen ? 'opacity-100 scale-y-100 pointer-events-auto' : 'opacity-0 scale-y-95 pointer-events-none',
        ].join(' ')}
        role="dialog"
        aria-label="Mobile navigation"
        aria-modal="true"
      >
        <div className="mx-4 mt-1 rounded-xl border border-[#1E2A3A] bg-[#0D1117]/95 backdrop-blur-md shadow-2xl overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-[#1E2A3A]">
            <span className="text-[10px] font-mono text-[#5A6478] uppercase tracking-widest">Navigation</span>
            <div className="flex items-center gap-1.5">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400" />
              </span>
              <span className="text-[10px] font-mono text-emerald-400">Recovery Engine Live</span>
            </div>
          </div>

          <nav className="p-2" aria-label="Mobile navigation links">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const active = isItemActive(item, pathname, hash);
              return (
                <Link
                  key={item.label}
                  href={item.href}
                  onClick={(e) => handleNavClick(e, item)}
                  className={[
                    'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 group',
                    active
                      ? 'bg-blue-600/15 text-blue-400 border border-blue-500/25'
                      : 'text-[#8B98B0] hover:text-[#F0F4FF] hover:bg-[#141C27] border border-transparent',
                  ].join(' ')}
                  aria-current={active ? 'page' : undefined}
                >
                  <span className={[
                    'flex items-center justify-center h-7 w-7 rounded-md border transition-colors duration-150',
                    active
                      ? 'bg-blue-600/20 border-blue-500/30 text-blue-400'
                      : 'bg-[#111720] border-[#1E2A3A] text-[#5A6478] group-hover:text-[#8B98B0] group-hover:border-[#243040]',
                  ].join(' ')}>
                    <Icon className="h-3.5 w-3.5" />
                  </span>
                  <span className="flex-1">{item.label}</span>
                  <ChevronRight className={[
                    'h-3.5 w-3.5 transition-all duration-150',
                    active ? 'text-blue-400' : 'text-[#5A6478] group-hover:text-[#8B98B0] group-hover:translate-x-0.5',
                  ].join(' ')} />
                </Link>
              );
            })}
          </nav>

          <div className="px-4 pb-4 pt-2 border-t border-[#1E2A3A]">
            <Link
              href="/dashboard"
              className="flex items-center justify-center gap-2 w-full rounded-lg bg-blue-600 hover:bg-blue-500 px-4 py-2.5 text-sm font-semibold text-white transition-all duration-150 shadow-[0_0_16px_rgba(59,130,246,0.25)]"
              onClick={() => setMobileOpen(false)}
            >
              <Activity className="h-4 w-4" />
              Open Command Center
            </Link>
          </div>
        </div>
      </div>
    </>
  );
};

export default Navbar;
