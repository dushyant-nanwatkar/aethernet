"use client";

import { useState } from "react";
import Link from "next/link";
import { TelemetryGrid } from "@/components/telemetry-grid";
import { TerminalView } from "@/components/terminal-view";
import { HealthNodes } from "@/components/health-nodes";
import { AIChat } from "@/components/ai-chat";
import { Activity, Terminal, Bot, ArrowLeft } from "lucide-react";
import { JellyRadio } from "@/components/jelly-radio";

export default function NocPage() {
  const [activeTab, setActiveTab] = useState<string>("terminal");

  return (
    <div className="min-h-screen bg-black text-white p-4 md:p-8 flex flex-col gap-6 max-w-7xl mx-auto w-full">
      {/* Header */}
      <header className="flex items-center justify-between border-b border-white/10 pb-4 bg-black">
        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="px-3 py-2 bg-black hover:bg-white/10 rounded-xl border border-white/10 text-zinc-300 hover:text-white transition-all flex items-center gap-2 text-xs font-mono shadow-[0_0_15px_rgba(0,0,0,0.8)]"
          >
            <ArrowLeft size={14} className="text-cyan-400" />
            <span>AI Studio</span>
          </Link>

          <div className="p-2 bg-black rounded-xl border border-cyan-400/30 shadow-[0_0_15px_rgba(0,245,255,0.2)]">
            <Activity className="text-cyan-400 animate-pulse" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-white">AetherNet NOC</h1>
            <p className="text-xs text-zinc-500 font-mono">AUTONOMOUS TELEMETRY ENGINE • AMOLED EDITION</p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          {/* Jelly Radio Tab Switcher */}
          <JellyRadio
            options={[
              { id: "terminal", label: "Terminal Stream", icon: <Terminal size={14} /> },
              { id: "chat", label: "Diagnostic Bot", icon: <Bot size={14} /> },
            ]}
            value={activeTab}
            onChange={(val) => setActiveTab(val)}
          />

          <div className="hidden md:flex items-center gap-3 text-xs font-mono text-zinc-500">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.8)]" />
              <span className="text-emerald-400 font-bold">LIVE TELEMETRY</span>
            </div>
            <span>|</span>
            <span>100ms Fidelity</span>
          </div>
        </div>
      </header>

      {/* Main Telemetry Grid */}
      <TelemetryGrid />

      {/* Bottom Section */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 h-[460px]">
        <div className="lg:col-span-3 h-full overflow-hidden">
          {activeTab === "terminal" ? <TerminalView /> : <AIChat />}
        </div>
        <div className="lg:col-span-1 h-full overflow-y-auto">
          <HealthNodes />
        </div>
      </div>
    </div>
  );
}
