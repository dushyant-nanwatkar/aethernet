"use client";

import { useState, useRef, useEffect } from "react";
import { Bot, Send, User, Sparkles, Terminal, ShieldCheck, RefreshCw } from "lucide-react";

interface Message {
  id: string;
  sender: "user" | "ai";
  text: string;
  timestamp: string;
  provider?: string;
  model?: string;
}

export function AIChat() {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "1",
      sender: "ai",
      text: "Hello! I am your air-gapped AetherNet AI Assistant. I can query local RAG logs, check system metrics, and trigger self-healing playbooks. Ask me anything!",
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      provider: "LOCAL AI",
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, loading]);

  const handleSend = async (textToSend?: string) => {
    const query = textToSend || input;
    if (!query.trim() || loading) return;

    const userMsg: Message = {
      id: Date.now().toString(),
      sender: "user",
      text: query,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, userMsg]);
    if (!textToSend) setInput("");
    setLoading(true);

    try {
      const orchestratorUrl = process.env.NEXT_PUBLIC_ORCHESTRATOR_URL || "http://localhost:8000";
      const res = await fetch(`${orchestratorUrl}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: query }),
      });

      const data = await res.json();

      const aiMsg: Message = {
        id: (Date.now() + 1).toString(),
        sender: "ai",
        text: data.reply || "No response received.",
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        provider: data.provider?.toUpperCase() || "LOCAL AI",
        model: data.model || "default",
      };

      setMessages((prev) => [...prev, aiMsg]);
    } catch (e: any) {
      const aiMsg: Message = {
        id: (Date.now() + 1).toString(),
        sender: "ai",
        text: `⚠️ Could not reach AI Orchestrator at http://localhost:8000. Please start it with 'make orchestrator'. Error: ${e.message}`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      setMessages((prev) => [...prev, aiMsg]);
    } finally {
      setLoading(false);
    }
  };

  const suggestions = [
    "What is the system status?",
    "Search Qdrant logs for Redis errors",
    "How does VRAM self-healing work?",
    "Check Kafka pipeline health",
  ];

  return (
    <div className="flex flex-col w-full h-full bg-black border border-white/10 rounded-2xl overflow-hidden shadow-[0_0_30px_rgba(0,0,0,0.9)] backdrop-blur-xl">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-black border-b border-white/10">
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 bg-black border border-cyan-400/30 rounded-lg text-cyan-400 shadow-[0_0_10px_rgba(0,245,255,0.2)]">
            <Bot size={18} />
          </div>
          <div>
            <h3 className="text-xs font-bold font-mono text-white uppercase tracking-wider flex items-center gap-2">
              AetherNet Diagnostic Bot
            </h3>
            <p className="text-[10px] text-zinc-500 font-mono">OFFLINE INFERENCE ENGINE</p>
          </div>
        </div>

        <div className="flex items-center gap-2 font-mono text-[11px] text-zinc-400 bg-black px-2.5 py-1 rounded-md border border-white/10">
          <ShieldCheck size={14} className="text-emerald-400" />
          <span className="text-emerald-400 font-bold">AIR-GAPPED</span>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 p-4 overflow-y-auto flex flex-col gap-4 font-sans text-sm bg-black">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex items-start gap-3 ${
              msg.sender === "user" ? "flex-row-reverse" : "flex-row"
            }`}
          >
            <div
              className={`p-2 rounded-lg text-xs font-mono flex items-center justify-center shrink-0 ${
                msg.sender === "user"
                  ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/30"
                  : "bg-purple-500/20 text-purple-300 border border-purple-500/30"
              }`}
            >
              {msg.sender === "user" ? <User size={16} /> : <Bot size={16} />}
            </div>

            <div
              className={`flex flex-col gap-1 max-w-[80%] ${
                msg.sender === "user" ? "items-end" : "items-start"
              }`}
            >
              <div
                className={`p-3.5 rounded-xl text-slate-200 text-xs leading-relaxed shadow-md ${
                  msg.sender === "user"
                    ? "bg-cyan-950/80 border border-cyan-800/60 rounded-tr-none text-cyan-50"
                    : "bg-slate-950/90 border border-slate-800 rounded-tl-none font-mono text-slate-300 whitespace-pre-wrap"
                }`}
              >
                {msg.text}
              </div>

              <div className="flex items-center gap-2 px-1 text-[10px] font-mono text-slate-500">
                <span>{msg.timestamp}</span>
                {msg.provider && (
                  <>
                    <span>•</span>
                    <span className="text-cyan-400/80">{msg.provider} ({msg.model})</span>
                  </>
                )}
              </div>
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-purple-500/20 text-purple-300 border border-purple-500/30 font-mono text-xs">
              <Bot size={16} />
            </div>
            <div className="p-3 bg-slate-950/90 border border-slate-800 rounded-xl rounded-tl-none text-xs font-mono text-cyan-400 flex items-center gap-2">
              <RefreshCw size={14} className="animate-spin text-cyan-400" />
              <span>Synthesizing Local LLM Response...</span>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Suggestion Chips */}
      <div className="px-4 py-2 bg-slate-950/60 border-t border-slate-800/80 flex items-center gap-2 overflow-x-auto no-scrollbar">
        <Sparkles size={13} className="text-cyan-400 shrink-0" />
        {suggestions.map((chip, idx) => (
          <button
            key={idx}
            onClick={() => handleSend(chip)}
            className="text-[11px] font-mono whitespace-nowrap px-2.5 py-1 rounded-md bg-slate-900 hover:bg-slate-800 border border-slate-800 hover:border-cyan-500/40 text-slate-300 transition-colors cursor-pointer shrink-0"
          >
            {chip}
          </button>
        ))}
      </div>

      {/* Input */}
      <div className="p-3 bg-slate-950 border-t border-slate-800 flex items-center gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSend()}
          placeholder="Ask AI Assistant or instruct self-healing engine..."
          className="flex-1 bg-slate-900 border border-slate-800 focus:border-cyan-500/60 rounded-lg px-3.5 py-2 text-xs font-mono text-slate-100 placeholder-slate-500 focus:outline-none transition-colors"
        />
        <button
          onClick={() => handleSend()}
          disabled={loading || !input.trim()}
          className="p-2 bg-cyan-500 hover:bg-cyan-400 disabled:opacity-50 text-slate-950 font-bold rounded-lg transition-colors cursor-pointer"
        >
          <Send size={16} />
        </button>
      </div>
    </div>
  );
}
