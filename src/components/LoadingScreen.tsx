'use client';

import React, { useEffect, useState } from 'react';

interface LoadingScreenProps { loading: boolean; }

const STAGES = [
  { at: 0, progress: 14, label: 'Initializing recovery engine...' },
  { at: 420, progress: 38, label: 'Loading recovery intelligence...' },
  { at: 900, progress: 63, label: 'Connecting recovery pipeline...' },
  { at: 1380, progress: 82, label: 'Verifying guardrails...' },
  { at: 1840, progress: 92, label: 'Preparing command center...' },
] as const;

export const LoadingScreen: React.FC<LoadingScreenProps> = ({ loading }) => {
  const [stage, setStage] = useState(0);
  const [revealing, setRevealing] = useState(false);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const timers = STAGES.slice(1).map((item, index) => window.setTimeout(() => setStage(index + 1), item.at));
    return () => timers.forEach(window.clearTimeout);
  }, []);

  useEffect(() => {
    if (loading || revealing) return;
    setStage(STAGES.length - 1);
    const revealTimer = window.setTimeout(() => setRevealing(true), 160);
    const removeTimer = window.setTimeout(() => setVisible(false), 920);
    return () => { window.clearTimeout(revealTimer); window.clearTimeout(removeTimer); };
  }, [loading, revealing]);

  if (!visible) return null;
  const current = revealing ? { progress: 100, label: 'Command center ready' } : STAGES[stage];

  return (
    <div aria-label="Initializing RecoverAI command center" aria-live="polite" role="status" className={`intro-screen fixed inset-0 z-[9999] flex min-h-[100svh] items-center justify-center overflow-hidden bg-[#070A10] px-5 text-center ${revealing ? 'intro-screen--revealing' : ''}`}>
      <div className="intro-atmosphere" aria-hidden="true">
        <span className="intro-grid" /><span className="intro-orbit intro-orbit--one" /><span className="intro-orbit intro-orbit--two" />
        <span className="intro-fragment intro-fragment--one" /><span className="intro-fragment intro-fragment--two" /><span className="intro-fragment intro-fragment--three" />
      </div>
      <div className="relative z-10 flex w-full max-w-xl flex-col items-center">
        <div className="intro-tile-stage" aria-hidden="true">
          <div className="intro-tile-shadow" /><div className="intro-tile intro-tile--rear" /><div className="intro-tile intro-tile--middle" />
          <div className="intro-tile intro-tile--front">
            <span className="intro-tile-gloss" /><span className="intro-tile-grid" /><span className="intro-tile-scan" /><span className="intro-tile-core"><i /></span>
            <span className="intro-tile-corner intro-tile-corner--tl" /><span className="intro-tile-corner intro-tile-corner--tr" /><span className="intro-tile-corner intro-tile-corner--bl" /><span className="intro-tile-corner intro-tile-corner--br" />
          </div>
        </div>
        <div className="intro-copy mt-12 sm:mt-14"><p className="intro-eyebrow">AI REVENUE RECOVERY</p><h1>RecoverAI</h1><p className="intro-title">INITIALIZING REVENUE RECOVERY</p></div>
        <div className="intro-progress mt-8 w-full max-w-sm text-left">
          <div className="intro-progress-meta"><span>{current.label}</span><span>{String(current.progress).padStart(2, '0')}%</span></div>
          <div className="intro-progress-track"><span className="intro-progress-segments" /><span className="intro-progress-fill" style={{ width: `${current.progress}%` }} /></div>
        </div>
      </div>
      <style>{`
        .intro-screen { opacity:1; transition:opacity 620ms ease,visibility 620ms ease; perspective:1200px }.intro-screen--revealing{opacity:0;visibility:hidden;pointer-events:none}.intro-atmosphere{position:absolute;inset:0;overflow:hidden;pointer-events:none;background:radial-gradient(ellipse 55% 45% at 50% 43%,rgba(30,90,150,.16),transparent 70%),radial-gradient(ellipse 40% 35% at 70% 18%,rgba(45,184,180,.055),transparent 74%),radial-gradient(ellipse 34% 30% at 27% 72%,rgba(200,100,155,.045),transparent 75%)}.intro-grid{position:absolute;inset:-20%;opacity:.24;background-image:linear-gradient(rgba(116,160,205,.12) 1px,transparent 1px),linear-gradient(90deg,rgba(116,160,205,.12) 1px,transparent 1px);background-size:56px 56px;mask-image:radial-gradient(circle at center,black,transparent 66%);transform:perspective(900px) rotateX(62deg) translateY(18%);animation:intro-grid-drift 16s linear infinite}.intro-orbit{position:absolute;left:50%;top:46%;width:min(78vw,830px);aspect-ratio:1;border:1px solid rgba(91,153,211,.11);border-radius:50%;transform:translate(-50%,-50%) rotateX(68deg)}.intro-orbit--two{width:min(52vw,550px);border-color:rgba(81,205,196,.12);animation:intro-orbit 12s linear infinite}.intro-fragment{position:absolute;width:5px;height:5px;border-radius:1px;background:#7dd3fc;box-shadow:0 0 18px rgba(125,211,252,.45);opacity:.55;animation:intro-fragment 6s ease-in-out infinite}.intro-fragment--one{top:29%;left:20%}.intro-fragment--two{top:64%;right:19%;background:#5eead4;animation-delay:-2s}.intro-fragment--three{top:18%;right:31%;width:3px;height:3px;background:#f0abfc;animation-delay:-4s}
        .intro-tile-stage{position:relative;width:clamp(190px,25vw,300px);aspect-ratio:1;transform-style:preserve-3d;animation:intro-stage 5.5s cubic-bezier(.45,.05,.55,.95) infinite}.intro-tile{position:absolute;inset:0;border-radius:25%;transform-style:preserve-3d}.intro-tile-shadow{position:absolute;width:84%;height:16%;left:8%;bottom:-12%;border-radius:50%;background:rgba(0,0,0,.75);filter:blur(18px);transform:rotateX(75deg)}.intro-tile--rear{transform:translate3d(-13px,18px,-31px);background:linear-gradient(145deg,#07101e,#101b2d);border:1px solid rgba(58,137,218,.26);box-shadow:inset -12px -16px 20px rgba(0,0,0,.35)}.intro-tile--middle{transform:translate3d(-7px,9px,-15px);background:linear-gradient(145deg,#0a1727,#17233a);border:1px solid rgba(85,186,207,.36);box-shadow:inset 1px 1px rgba(255,255,255,.07)}.intro-tile--front{overflow:hidden;border:1px solid rgba(151,213,255,.48);background:linear-gradient(135deg,#1a314d 0%,#101c30 42%,#0a1423 100%);box-shadow:inset 1px 1px 0 rgba(255,255,255,.22),inset -22px -24px 30px rgba(1,6,16,.55),0 24px 46px rgba(0,0,0,.45)}.intro-tile-gloss{position:absolute;inset:0;background:linear-gradient(125deg,rgba(196,234,255,.3),transparent 28%,transparent 62%,rgba(44,177,198,.08))}.intro-tile-grid{position:absolute;inset:13%;border-radius:19%;opacity:.65;background-image:linear-gradient(rgba(115,200,219,.22) 1px,transparent 1px),linear-gradient(90deg,rgba(115,200,219,.22) 1px,transparent 1px);background-size:17% 17%;border:1px solid rgba(101,197,223,.23)}.intro-tile-scan{position:absolute;left:11%;right:11%;height:2px;top:25%;background:linear-gradient(90deg,transparent,rgba(131,236,243,.9),transparent);box-shadow:0 0 12px rgba(76,199,224,.7);animation:intro-scan 2.7s ease-in-out infinite}.intro-tile-core{position:absolute;display:grid;place-items:center;left:50%;top:50%;width:31%;aspect-ratio:1;border-radius:30%;transform:translate(-50%,-50%);background:linear-gradient(135deg,rgba(81,171,253,.85),rgba(62,221,196,.55));box-shadow:0 0 24px rgba(78,187,230,.33),inset 1px 1px rgba(255,255,255,.5)}.intro-tile-core i{display:block;width:45%;height:45%;border-radius:25%;background:#0c1a2c;border:1px solid rgba(220,249,255,.55)}.intro-tile-corner{position:absolute;width:13%;height:13%;border-color:rgba(137,220,255,.8)}.intro-tile-corner--tl{top:9%;left:9%;border-top:2px solid;border-left:2px solid}.intro-tile-corner--tr{top:9%;right:9%;border-top:2px solid;border-right:2px solid}.intro-tile-corner--bl{bottom:9%;left:9%;border-bottom:2px solid;border-left:2px solid}.intro-tile-corner--br{bottom:9%;right:9%;border-bottom:2px solid;border-right:2px solid}
        .intro-copy{transition:opacity 300ms ease,transform 300ms ease}.intro-eyebrow,.intro-title,.intro-progress-meta{font-family:var(--font-geist-mono),ui-monospace,monospace;letter-spacing:.18em;text-transform:uppercase}.intro-eyebrow{margin:0;color:#75a9cb;font-size:10px;font-weight:650}.intro-copy h1{margin:9px 0 7px;color:#f6f9ff;font-size:clamp(2.7rem,6vw,4.3rem);font-weight:800;letter-spacing:-.055em;line-height:.96;text-shadow:0 10px 28px rgba(0,0,0,.45)}.intro-title{margin:0;color:#b9cee6;font-size:clamp(10px,1.3vw,12px);font-weight:700}.intro-progress-meta{display:flex;justify-content:space-between;gap:16px;margin-bottom:10px;color:#8fa6bf;font-size:10px;font-weight:650;letter-spacing:.1em}.intro-progress-meta span:last-child{color:#7ccee4}.intro-progress-track{position:relative;height:7px;overflow:hidden;border:1px solid rgba(117,159,192,.3);border-radius:999px;background:#0a121f;box-shadow:inset 0 1px 3px rgba(0,0,0,.6),0 1px rgba(255,255,255,.06)}.intro-progress-segments{position:absolute;inset:1px;opacity:.55;background:repeating-linear-gradient(90deg,transparent 0 17px,rgba(143,185,214,.24) 17px 18px)}.intro-progress-fill{position:relative;display:block;height:100%;border-radius:inherit;background:linear-gradient(90deg,#2277d9,#46bfc4 78%,#91d8df);box-shadow:0 0 13px rgba(63,184,213,.45);transition:width 500ms cubic-bezier(.22,1,.36,1)}.intro-progress-fill::after{content:'';position:absolute;right:0;top:-4px;width:16px;height:14px;background:rgba(237,253,255,.54);filter:blur(5px)}.intro-screen--revealing .intro-tile-stage{animation:intro-reveal 700ms cubic-bezier(.76,0,.24,1) forwards}.intro-screen--revealing .intro-copy,.intro-screen--revealing .intro-progress{opacity:0;transform:translateY(10px);transition:opacity 180ms ease,transform 180ms ease}
        @keyframes intro-stage{0%,100%{transform:rotateX(19deg) rotateY(-22deg) rotateZ(-5deg) translateY(0)}50%{transform:rotateX(28deg) rotateY(18deg) rotateZ(5deg) translateY(-9px)}}@keyframes intro-scan{0%,100%{transform:translateY(-5px);opacity:.25}50%{transform:translateY(155px);opacity:1}}@keyframes intro-grid-drift{to{background-position:56px 56px}}@keyframes intro-orbit{to{transform:translate(-50%,-50%) rotateX(68deg) rotate(360deg)}}@keyframes intro-fragment{50%{transform:translateY(-18px);opacity:1}}@keyframes intro-reveal{to{transform:scale(9) rotateX(0) rotateY(0);opacity:.15}}@media(prefers-reduced-motion:reduce){.intro-grid,.intro-orbit--two,.intro-fragment,.intro-tile-stage,.intro-tile-scan{animation:none}.intro-screen--revealing .intro-tile-stage{transform:scale(9)}}
      `}</style>
    </div>
  );
};

export default LoadingScreen;
