"use client";

import { useTelemetryStore } from "@/store/telemetry";
import { Database, Server, Cpu, Box } from "lucide-react";

export function HealthNodes() {
  const { health } = useTelemetryStore();

  const services = [
    { name: "Kafka KRaft", icon: Box, status: health.kafka },
    { name: "Postgres 16", icon: Database, status: health.postgres },
    { name: "Redis Cache", icon: Server, status: health.redis },
    { name: "Go Daemon", icon: Cpu, status: health.daemon },
  ];

  return (
    <div className="flex flex-col gap-3 bg-black p-4 border border-white/10 rounded-2xl backdrop-blur-xl shadow-[0_0_30px_rgba(0,0,0,0.9)]">
      <h3 className="text-xs font-mono text-zinc-500 uppercase tracking-widest font-semibold mb-1">
        Service Health
      </h3>

      {services.map((svc) => (
        <div
          key={svc.name}
          className="flex items-center justify-between p-2 rounded-xl bg-black border border-white/5 hover:border-white/10 transition-colors group"
        >
          <div className="flex items-center gap-3">
            <div
              className={`p-2 rounded-lg ${
                svc.status
                  ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shadow-[0_0_10px_rgba(16,185,129,0.2)]"
                  : "bg-red-500/10 text-red-400 border border-red-500/20 shadow-[0_0_10px_rgba(239,68,68,0.2)]"
              } transition-colors`}
            >
              <svc.icon size={16} strokeWidth={2.5} />
            </div>
            <span className="text-sm font-semibold text-zinc-200">{svc.name}</span>
          </div>

          <div className="flex items-center gap-2">
            <div
              className={`text-xs font-mono font-bold ${
                svc.status ? "text-emerald-400" : "text-red-400"
              }`}
            >
              {svc.status ? "ONLINE" : "DOWN"}
            </div>
            {svc.status && (
              <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.9)]" />
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
