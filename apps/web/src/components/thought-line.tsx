"use client";

import { useState, useEffect, useRef } from "react";
import { Brain, ChevronDown, ChevronRight, Clock, Sparkles } from "lucide-react";

interface ThoughtLineProps {
  thinking: string;
  isActive: boolean;
  durationSec?: string;
  defaultExpanded?: boolean;
}

export function ThoughtLine({
  thinking,
  isActive,
  durationSec,
  defaultExpanded = true,
}: ThoughtLineProps) {
  const [isExpanded, setIsExpanded] = useState<boolean>(isActive ? true : defaultExpanded);
  const [liveElapsed, setLiveElapsed] = useState<string>("0.0s");
  const scrollRef = useRef<HTMLDivElement>(null);
  const hasUserToggledRef = useRef<boolean>(false);

  // Automatically expand and stay visible when active unless user explicitly collapsed it
  useEffect(() => {
    if (isActive && !hasUserToggledRef.current) {
      setIsExpanded(true);
    }
  }, [isActive]);

  // Live timer while reasoning is active
  useEffect(() => {
    if (!isActive) return;
    const start = Date.now();
    const timer = setInterval(() => {
      const diffSec = ((Date.now() - start) / 1000).toFixed(1);
      setLiveElapsed(`${diffSec}s`);
    }, 100);
    return () => clearInterval(timer);
  }, [isActive]);

  // Smooth auto-scroll to the bottom of the trace as thoughts stream in
  useEffect(() => {
    if (isActive && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [thinking, isActive]);

  // Parse lines/bullet steps or sentences from thinking text without dropping in-progress trailing words
  const rawSteps = thinking
    .split(/\n+/)
    .flatMap((para) => {
      const trimmed = para.trim();
      if (!trimmed) return [];
      // If it's already an explicit bullet or header item, keep as is
      if (trimmed.startsWith("•") || trimmed.startsWith("-") || trimmed.startsWith("*")) {
        return [trimmed];
      }
      // If a single paragraph is long, split on sentence boundaries while preserving trailing words
      if (trimmed.length > 120) {
        const matches = trimmed.match(/[^.!?]+[.!?]+(\s+|$)/g);
        if (matches && matches.length > 0) {
          const matchedLen = matches.join("").length;
          const remainder = trimmed.slice(matchedLen).trim();
          return remainder ? [...matches.map((m) => m.trim()), remainder] : matches.map((m) => m.trim());
        }
      }
      return [trimmed];
    })
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  const stepCount = Math.max(1, rawSteps.length);
  const displayedDuration = isActive ? liveElapsed : `${durationSec || "2.1"}s`;

  const toggleExpanded = () => {
    hasUserToggledRef.current = true;
    setIsExpanded((prev) => !prev);
  };

  return (
    <div className="w-full my-2 border border-white/10 rounded-2xl bg-black/90 backdrop-blur-2xl overflow-hidden transition-all duration-300 shadow-[0_0_25px_rgba(168,85,247,0.12)]">
      {/* Header Bar */}
      <button
        onClick={toggleExpanded}
        className="w-full px-4 py-2.5 flex items-center justify-between hover:bg-white/[0.04] transition-colors cursor-pointer group"
      >
        <div className="flex items-center gap-2.5 text-xs font-mono">
          <div className="relative">
            <Brain
              size={15}
              className={`text-purple-400 ${
                isActive ? "animate-pulse drop-shadow-[0_0_10px_rgba(192,132,252,0.9)]" : ""
              }`}
            />
            {isActive && (
              <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-cyan-400 animate-ping" />
            )}
          </div>

          <span className="font-semibold text-purple-300">
            {isActive ? "Thinking deeply..." : "Thought for"}
          </span>

          <div className="flex items-center gap-1.5 text-purple-200 bg-purple-950/60 border border-purple-500/30 px-2.5 py-0.5 rounded-full text-[11px] shadow-[0_0_10px_rgba(168,85,247,0.2)]">
            <Clock size={11} className="text-purple-400" />
            <span>{displayedDuration}</span>
          </div>

          {!isActive && (
            <>
              <span className="text-zinc-600">•</span>
              <span className="text-zinc-400 text-[11px] font-sans">
                {stepCount} {stepCount === 1 ? "step" : "steps"} of reasoning
              </span>
            </>
          )}

          {isActive && (
            <span className="hidden sm:inline-flex items-center gap-1 text-[11px] text-cyan-400/90 font-mono">
              <Sparkles size={11} className="animate-spin text-cyan-400" />
              <span>Streaming internal tokens...</span>
            </span>
          )}
        </div>

        {/* Accordion Chevron & Toggle Hint */}
        <div className="flex items-center gap-2 text-[11px] font-mono text-zinc-400 group-hover:text-purple-300 transition-colors">
          <span>{isExpanded ? "Collapse trace" : "View thinking"}</span>
          {isExpanded ? (
            <ChevronDown size={14} className="text-purple-400 transition-transform" />
          ) : (
            <ChevronRight size={14} className="text-zinc-500 transition-transform" />
          )}
        </div>
      </button>

      {/* Expanded Trace Body */}
      {isExpanded && (
        <div
          ref={scrollRef}
          className="px-5 py-3.5 border-t border-white/5 bg-black font-mono text-[12px] text-zinc-300 space-y-2.5 max-h-96 overflow-y-auto leading-relaxed scroll-smooth"
        >
          {rawSteps.length > 0 ? (
            rawSteps.map((step, idx) => (
              <div key={idx} className="flex items-start gap-3">
                <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-purple-400 shrink-0 shadow-[0_0_8px_rgba(192,132,252,0.8)]" />
                <span className="text-zinc-200 leading-relaxed break-words">{step.replace(/^[•\-\*]\s*/, "")}</span>
              </div>
            ))
          ) : (
            <div className="text-zinc-500 italic">Formulating logical chain-of-thought...</div>
          )}

          {isActive && (
            <div className="flex items-center gap-2 pt-2 text-cyan-400 text-[11px] font-mono">
              <span className="inline-block w-2 h-2 rounded-full bg-cyan-400 animate-ping shadow-[0_0_8px_rgba(34,211,238,0.8)]" />
              <span>Streaming internal reasoning tokens from GPU...</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
