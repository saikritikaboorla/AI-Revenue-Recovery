"use client";

import React, { useRef, useEffect } from 'react';
import gsap from 'gsap';

interface FoldTextProps {
  text: string;
  className?: string;
  subtext?: string;
}

export const FoldText: React.FC<FoldTextProps> = ({ text, className = '', subtext }) => {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const chars = containerRef.current.querySelectorAll('.fold-char');
    
    gsap.fromTo(
      chars,
      {
        rotateX: -90,
        opacity: 0,
        y: 20,
        transformOrigin: 'top center'
      },
      {
        rotateX: 0,
        opacity: 1,
        y: 0,
        duration: 0.8,
        stagger: 0.03,
        ease: 'power3.out',
        delay: 0.1
      }
    );
  }, [text]);

  return (
    <div className={`flex flex-col items-center justify-center text-center ${className}`}>
      <div 
        ref={containerRef} 
        className="flex flex-wrap items-center justify-center gap-x-[0.25em] font-extrabold tracking-tight"
        style={{ perspective: 1000 }}
      >
        {text.split(' ').map((word, wIdx) => (
          <span key={wIdx} className="inline-flex whitespace-nowrap">
            {word.split('').map((char, cIdx) => (
              <span
                key={cIdx}
                className="fold-char inline-block text-white transition-colors duration-200 hover:text-blue-400"
                style={{ transformStyle: 'preserve-3d' }}
              >
                {char}
              </span>
            ))}
          </span>
        ))}
      </div>
      {subtext && (
        <p className="mt-4 max-w-2xl text-base md:text-lg text-slate-400 font-normal leading-relaxed">
          {subtext}
        </p>
      )}
    </div>
  );
};
