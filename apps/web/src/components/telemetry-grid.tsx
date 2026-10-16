"use client";

import { useTelemetryStore } from "@/store/telemetry";
import { RadialBarChart, RadialBar, ResponsiveContainer, PolarAngleAxis } from "recharts";

const Gauge = ({
  name,
  value,
  max = 100,
  color = "#00f5ff",
}: {
  name: string;
  value: number;
  max?: number;
  color?: string;
}) => {
  const data = [{ name, value }];

  return (
    <div className="flex flex-col items-center justify-center p-4 bg-black border border-white/10 rounded-2xl shadow-[0_0_30px_rgba(0,0,0,0.9)] relative overflow-hidden backdrop-blur-xl group hover:border-cyan-400/40 hover:shadow-[0_0_30px_rgba(0,245,255,0.15)] transition-all">
      <div className="absolute top-4 left-4 text-xs font-mono text-zinc-500 tracking-widest uppercase font-semibold">
        {name}
      </div>
      <div className="h-40 w-full mt-4">
        <ResponsiveContainer width="100%" height="100%">
          <RadialBarChart
            cx="50%"
            cy="50%"
            innerRadius="70%"
            outerRadius="100%"
            barSize={12}
            data={data}
            startAngle={180}
            endAngle={0}
          >
            <PolarAngleAxis
              type="number"
              domain={[0, max]}
              angleAxisId={0}
              tick={false}
            />
            <RadialBar
              background={{ fill: "#111115" }}
              dataKey="value"
              cornerRadius={10}
              fill={color}
            />
          </RadialBarChart>
        </ResponsiveContainer>
      </div>
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/4 flex items-baseline gap-1">
        <span className="text-3xl font-mono font-extrabold text-white tracking-tight">
          {value.toFixed(1)}
        </span>
        <span className="text-sm text-zinc-500 font-mono">%</span>
      </div>
    </div>
  );
};

export function TelemetryGrid() {
  const { metrics } = useTelemetryStore();

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 w-full">
      <Gauge name="CPU Core Load" value={metrics.cpu} color="#00f5ff" />
      <Gauge name="Memory Usage" value={metrics.ram} color="#10b981" />
      <Gauge name="GPU Compute" value={metrics.gpu} color="#c084fc" />
      <Gauge name="VRAM Allocated" value={metrics.vram} max={100} color="#fbbf24" />
    </div>
  );
}
