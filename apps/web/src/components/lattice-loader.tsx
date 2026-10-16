"use client";

import { useEffect, useState } from "react";

interface LatticeLoaderProps {
  rows?: number;
  cols?: number;
  label?: string;
  startTime?: number;
}

export function LatticeLoader({
  rows = 3,
  cols = 5,
  label = "Reasoning in progress",
  startTime,
}: LatticeLoaderProps) {
  const [elapsedMs, setElapsedMs] = useState(0);

  useEffect(() => {
    const start = startTime || Date.now();
    const interval = setInterval(() => {
      setElapsedMs(Date.now() - start);
    }, 50);
    return () => clearInterval(interval);
  }, [startTime]);

  const formatStopwatch = (ms: number) => {
    const seconds = Math.floor(ms / 1000);
    const tenths = Math.floor((ms % 1000) / 100);
    return `${seconds}.${tenths}s`;
  };

  return (
    <div className="flex items-center gap-3 px-3 py-1.5 rounded-xl bg-black border border-white/10 shadow-[0_0_15px_rgba(34,211,238,0.15)] w-fit backdrop-blur-md">
      {/* Lattice Grid of Shimmering LED Cells */}
      <div
        className="grid gap-1"
        style={{
          gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
        }}
      >
        {Array.from({ length: rows * cols }).map((_, i) => {
          const row = Math.floor(i / cols);
          const col = i % cols;
          // wave delay calculation based on distance from top-left
          const delay = (row + col) * 0.12;

          return (
            <div
              key={i}
              className="w-1.5 h-1.5 rounded-[2px] bg-cyan-400 transition-opacity"
              style={{
                animation: `latticeWave 1.4s infinite ease-in-out both`,
                animationDelay: `${delay}s`,
              }}
            />
          );
        })}
      </div>

      {/* Status Label & Live Stopwatch */}
      <div className="flex items-center gap-2 text-xs font-mono">
        <span className="text-slate-300 font-medium">{label}</span>
        <span className="text-slate-600">•</span>
        <span className="text-cyan-400 font-bold tracking-wider">
          {formatStopwatch(elapsedMs)}
        </span>
      </div>
    </div>
  );
}
