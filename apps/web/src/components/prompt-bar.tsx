"use client";

import { useState, useRef, useEffect } from "react";
import {
  Send,
  Square,
  Paperclip,
  Mic,
  AtSign,
  Terminal,
  Sparkles,
  ChevronUp,
  Cpu,
  Database,
  Server,
  Activity,
  Zap,
} from "lucide-react";

interface PromptBarProps {
  input: string;
  onChange: (val: string) => void;
  onSend: (text?: string) => void;
  onStop: () => void;
  isGenerating: boolean;
  selectedModelName: string;
  estimatedTokens: number;
  onSelectModelClick?: () => void;
}

const SOURCES = [
  { id: "@Kafka", desc: "telemetry.raw stream & lag", icon: Server },
  { id: "@Redis", desc: "metrics:latest & PubSub", icon: Database },
  { id: "@Postgres", desc: "system_metrics database table", icon: Database },
  { id: "@Qdrant", desc: "syslog vector embeddings index", icon: Cpu },
  { id: "@GPU-NVML", desc: "VRAM allocation & core compute", icon: Activity },
];

const COMMANDS = [
  { id: "/flush_vram", desc: "Trigger Ansible flush_vram playbook", icon: Zap },
  { id: "/restart_service", desc: "Self-heal restart targeted container", icon: Server },
  { id: "/chaos_test", desc: "Inject fault & verify self-healing loop", icon: Activity },
  { id: "/incident_email", desc: "Draft engineering outage notification", icon: Terminal },
];

export function PromptBar({
  input,
  onChange,
  onSend,
  onStop,
  isGenerating,
  selectedModelName,
  estimatedTokens,
  onSelectModelClick,
}: PromptBarProps) {
  const [showSources, setShowSources] = useState(false);
  const [showCommands, setShowCommands] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [attachedFiles, setAttachedFiles] = useState<string[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.min(
        textareaRef.current.scrollHeight,
        220
      )}px`;
    }
  }, [input]);

  // Handle typing triggers for @ and /
  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    onChange(val);

    const lastWord = val.split(/\s+/).pop() || "";
    if (lastWord.startsWith("@")) {
      setShowSources(true);
      setShowCommands(false);
    } else if (lastWord.startsWith("/")) {
      setShowCommands(true);
      setShowSources(false);
    } else {
      setShowSources(false);
      setShowCommands(false);
    }
  };

  const insertSource = (srcId: string) => {
    const words = input.split(/\s+/);
    words.pop();
    const updated = [...words, srcId, ""].join(" ");
    onChange(updated);
    setShowSources(false);
    textareaRef.current?.focus();
  };

  const insertCommand = (cmdId: string) => {
    const words = input.split(/\s+/);
    words.pop();
    const updated = [...words, cmdId, ""].join(" ");
    onChange(updated);
    setShowCommands(false);
    textareaRef.current?.focus();
  };

  const toggleRecording = () => {
    setIsRecording(!isRecording);
    if (!isRecording) {
      // simulate speech-to-text
      setTimeout(() => {
        onChange(
          input +
            (input ? " " : "") +
            "Inspect high memory pressure anomaly across worker nodes"
        );
        setIsRecording(false);
      }, 2200);
    }
  };

  const addAttachment = () => {
    const mockFile = `telemetry_dump_${Date.now().toString().slice(-4)}.json`;
    setAttachedFiles((prev) => [...prev, mockFile]);
  };

  return (
    <div className="relative w-full max-w-4xl mx-auto">
      {/* Sources Popover */}
      {showSources && (
        <div className="absolute bottom-full left-4 mb-2 w-72 bg-black border border-white/10 rounded-2xl p-2 shadow-[0_0_30px_rgba(34,211,238,0.2)] z-50 backdrop-blur-2xl space-y-1">
          <div className="px-2.5 py-1 text-[10px] font-mono text-cyan-400 uppercase tracking-widest border-b border-white/5">
            Attach Telemetry Source (@)
          </div>
          {SOURCES.map((s) => {
            const Icon = s.icon;
            return (
              <button
                key={s.id}
                onClick={() => insertSource(s.id)}
                className="w-full flex items-center gap-2.5 p-2 rounded-xl text-left hover:bg-white/5 transition-colors cursor-pointer text-xs"
              >
                <div className="p-1 rounded bg-cyan-500/10 text-cyan-400">
                  <Icon size={14} />
                </div>
                <div>
                  <span className="font-mono font-bold text-slate-200">{s.id}</span>
                  <p className="text-[10px] text-slate-400">{s.desc}</p>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Commands Popover */}
      {showCommands && (
        <div className="absolute bottom-full left-4 mb-2 w-72 bg-black border border-white/10 rounded-2xl p-2 shadow-[0_0_30px_rgba(168,85,247,0.2)] z-50 backdrop-blur-2xl space-y-1">
          <div className="px-2.5 py-1 text-[10px] font-mono text-purple-400 uppercase tracking-widest border-b border-white/5">
            Quick System Commands (/)
          </div>
          {COMMANDS.map((c) => {
            const Icon = c.icon;
            return (
              <button
                key={c.id}
                onClick={() => insertCommand(c.id)}
                className="w-full flex items-center gap-2.5 p-2 rounded-xl text-left hover:bg-white/5 transition-colors cursor-pointer text-xs"
              >
                <div className="p-1 rounded bg-purple-500/10 text-purple-400">
                  <Icon size={14} />
                </div>
                <div>
                  <span className="font-mono font-bold text-slate-200">{c.id}</span>
                  <p className="text-[10px] text-slate-400">{c.desc}</p>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Main Composer Box */}
      <div className="rounded-2xl bg-black border border-white/10 shadow-[0_0_40px_rgba(0,0,0,0.9)] focus-within:border-cyan-400/40 focus-within:shadow-[0_0_30px_rgba(34,211,238,0.15)] transition-all p-3 backdrop-blur-2xl">
        {/* Attached Files Badges */}
        {attachedFiles.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-2 px-1">
            {attachedFiles.map((file, idx) => (
              <div
                key={idx}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/5 border border-white/10 text-[11px] font-mono text-slate-300"
              >
                <Paperclip size={11} className="text-cyan-400" />
                <span>{file}</span>
                <button
                  onClick={() =>
                    setAttachedFiles((prev) => prev.filter((_, i) => i !== idx))
                  }
                  className="hover:text-red-400 ml-1 text-slate-500"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Text Input */}
        <textarea
          ref={textareaRef}
          value={input}
          onChange={handleTextChange}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              onSend();
            }
          }}
          rows={1}
          placeholder="Ask local model, type @ for telemetry sources, or / for self-healing commands..."
          className="w-full bg-transparent px-2 pt-1 pb-2 text-sm text-white placeholder-zinc-500 focus:outline-none resize-none leading-relaxed"
          style={{ maxHeight: "200px" }}
        />

        {/* Action Controls Toolbar */}
        <div className="flex items-center justify-between pt-2 border-t border-white/5 mt-1 px-1">
          {/* Left Action Buttons: @ Sources, / Commands, Attachment, Mic */}
          <div className="flex items-center gap-1">
            <button
              onClick={() => {
                setShowSources(!showSources);
                setShowCommands(false);
              }}
              title="Attach data source (@)"
              className="p-1.5 rounded-lg hover:bg-white/10 text-zinc-400 hover:text-cyan-300 transition-colors cursor-pointer flex items-center gap-1 text-xs font-mono"
            >
              <AtSign size={15} />
              <span className="hidden sm:inline text-[11px]">Source</span>
            </button>

            <button
              onClick={() => {
                setShowCommands(!showCommands);
                setShowSources(false);
              }}
              title="System commands (/)"
              className="p-1.5 rounded-lg hover:bg-white/10 text-zinc-400 hover:text-purple-300 transition-colors cursor-pointer flex items-center gap-1 text-xs font-mono"
            >
              <Terminal size={15} />
              <span className="hidden sm:inline text-[11px]">Command</span>
            </button>

            <button
              onClick={addAttachment}
              title="Attach logs or telemetry snapshot"
              className="p-1.5 rounded-lg hover:bg-white/10 text-zinc-400 hover:text-white transition-colors cursor-pointer"
            >
              <Paperclip size={15} />
            </button>

            <button
              onClick={toggleRecording}
              title={isRecording ? "Listening..." : "Dictation input"}
              className={`p-1.5 rounded-lg transition-colors cursor-pointer flex items-center gap-1 ${
                isRecording
                  ? "bg-red-500/20 text-red-400 animate-pulse"
                  : "hover:bg-white/10 text-zinc-400 hover:text-white"
              }`}
            >
              <Mic size={15} />
              {isRecording && <span className="text-[10px] font-mono">Listening...</span>}
            </button>
          </div>

          {/* Right Action: Model Pill, Token Estimator, Send Button */}
          <div className="flex items-center gap-2.5">
            {onSelectModelClick && (
              <button
                onClick={onSelectModelClick}
                className="text-[10px] font-mono text-purple-300 bg-purple-950/30 hover:bg-purple-950/60 border border-purple-500/20 px-2 py-1 rounded-md transition-colors cursor-pointer hidden md:flex items-center gap-1"
              >
                <span>{selectedModelName}</span>
                <ChevronUp size={11} />
              </button>
            )}

            <span className="text-[10px] font-mono text-zinc-500 hidden sm:inline">
              ~{estimatedTokens} tokens
            </span>

            {isGenerating ? (
              <button
                onClick={onStop}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-red-600/20 hover:bg-red-600/30 border border-red-500/30 text-red-400 text-xs font-mono font-semibold transition-all cursor-pointer shadow-[0_0_15px_rgba(239,68,68,0.2)]"
              >
                <Square size={13} fill="currentColor" />
                <span>Stop</span>
              </button>
            ) : (
              <button
                onClick={() => onSend()}
                disabled={!input.trim()}
                className="p-2 rounded-xl bg-cyan-400 hover:bg-cyan-300 disabled:opacity-30 disabled:hover:bg-cyan-400 text-black font-bold transition-all shadow-[0_0_15px_rgba(34,211,238,0.4)] cursor-pointer disabled:cursor-not-allowed"
              >
                <Send size={15} />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
