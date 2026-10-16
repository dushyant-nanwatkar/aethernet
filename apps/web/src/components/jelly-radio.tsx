"use client";

import { useState } from "react";

export interface JellyOption {
  id: string;
  label: string;
  icon?: React.ReactNode;
  badge?: string;
}

interface JellyRadioProps {
  options: JellyOption[];
  value: string;
  onChange: (id: string) => void;
  className?: string;
}

export function JellyRadio({
  options,
  value,
  onChange,
  className = "",
}: JellyRadioProps) {
  const [clickedId, setClickedId] = useState<string | null>(null);

  const handleClick = (id: string) => {
    setClickedId(id);
    onChange(id);
    setTimeout(() => setClickedId(null), 300);
  };

  return (
    <div
      className={`flex items-center gap-2 p-1.5 rounded-2xl bg-black border border-white/10 shadow-[0_0_20px_rgba(0,0,0,0.8)] backdrop-blur-xl ${className}`}
    >
      {options.map((opt) => {
        const isSelected = opt.id === value;
        const isBouncing = opt.id === clickedId;

        return (
          <button
            key={opt.id}
            onClick={() => handleClick(opt.id)}
            className={`relative flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-mono transition-all duration-300 cursor-pointer select-none ${
              isSelected
                ? "bg-white text-black font-bold shadow-[0_0_20px_rgba(255,255,255,0.4)] scale-105 z-10"
                : "bg-transparent text-slate-400 hover:text-white hover:bg-white/5 scale-95"
            } ${isBouncing ? "animate-jelly" : ""}`}
            style={{
              transformOrigin: "center center",
            }}
          >
            {opt.icon && <span className="shrink-0">{opt.icon}</span>}
            <span>{opt.label}</span>
            {opt.badge && (
              <span
                className={`text-[9px] px-1.5 py-0.2 rounded-full font-sans uppercase font-bold tracking-wider ${
                  isSelected
                    ? "bg-black text-white"
                    : "bg-white/10 text-cyan-400 border border-cyan-400/30"
                }`}
              >
                {opt.badge}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
