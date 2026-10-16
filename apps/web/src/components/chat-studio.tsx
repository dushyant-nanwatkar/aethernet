"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  Bot,
  User,
  Plus,
  Trash2,
  Copy,
  Check,
  RotateCcw,
  Activity,
  Sliders,
  ChevronDown,
  Sparkles,
  Zap,
  Clock,
  Gauge,
  Brain,
  MessageSquare,
  ShieldCheck,
  ShieldAlert,
  Lock,
  Unlock,
  KeyRound,
  Eye,
  EyeOff,
  AlertTriangle,
  X,
  Loader2,
  Search,
  ExternalLink,
  Layers,
  Terminal,
  ArrowDown,
  HardDrive,
} from "lucide-react";
import { ThoughtLine } from "./thought-line";
import { PromptBar } from "./prompt-bar";
import { LatticeLoader } from "./lattice-loader";
import { JellyRadio, JellyOption } from "./jelly-radio";
import { MarkdownRenderer } from "./markdown-renderer";

interface ModelOption {
  id: string;
  name: string;
  provider: string;
  description: string;
  context_length: number;
  is_reasoning: boolean;
}

interface MessageMetrics {
  prompt_tokens?: number;
  completion_tokens?: number;
  reasoning_tokens?: number;
  total_tokens?: number;
  duration_sec?: string;
  tps?: string;
  ttft_ms?: number;
}

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  thinking?: string;
  isThinkingActive?: boolean;
  metrics?: MessageMetrics;
  timestamp: string;
  model: string;
}

interface ChatSession {
  id: string;
  title: string;
  messages: ChatMessage[];
  createdAt: number;
}

export function ChatStudio() {
  // Model state
  const [models, setModels] = useState<ModelOption[]>([]);
  const [selectedModel, setSelectedModel] = useState<string>("qwen/qwen3-14b");
  const [isLmStudioConnected, setIsLmStudioConnected] = useState<boolean>(false);
  const [isModelDropdownOpen, setIsModelDropdownOpen] = useState<boolean>(false);

  // Chat sessions state
  const [sessions, setSessions] = useState<ChatSession[]>([
    {
      id: "session-default",
      title: "New Conversation",
      messages: [],
      createdAt: Date.now(),
    },
  ]);
  const [activeSessionId, setActiveSessionId] = useState<string>("session-default");
  const [searchHistory, setSearchHistory] = useState<string>("");

  // Input & Generation state
  const [input, setInput] = useState<string>("");
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [generationStartTime, setGenerationStartTime] = useState<number | null>(null);
  const [abortController, setAbortController] = useState<AbortController | null>(null);

  // Model parameters drawer
  const [showSettings, setShowSettings] = useState<boolean>(false);
  const [temperature, setTemperature] = useState<number>(0.6);
  const [maxTokens, setMaxTokens] = useState<number>(4096);
  const [systemPrompt, setSystemPrompt] = useState<string>(
    "You are AetherNet Local AI, an air-gapped autonomous telemetry engineer and technical architect. Reason with chain-of-thought and provide rigorous, actionable answers."
  );

  // UI state
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // MCP Root Mode and Sudo Authentication state
  const [mcpMode, setMcpMode] = useState<"SAFE" | "ROOT">("SAFE");
  const [sudoPassword, setSudoPassword] = useState<string>("");
  const [isSudoModalOpen, setIsSudoModalOpen] = useState<boolean>(false);
  const [sudoInput, setSudoInput] = useState<string>("");
  const [showSudoPassword, setShowSudoPassword] = useState<boolean>(false);
  const [sudoAuthLoading, setSudoAuthLoading] = useState<boolean>(false);
  const [sudoAuthError, setSudoAuthError] = useState<string | null>(null);

  // Restore cached sudo password from sessionStorage on mount
  useEffect(() => {
    try {
      const cached = sessionStorage.getItem("aethernet_sudo_pwd");
      if (cached) {
        setSudoPassword(cached);
      }
    } catch (e) {}
  }, []);

  const handleToggleMcpMode = () => {
    if (mcpMode === "ROOT") {
      setMcpMode("SAFE");
      return;
    }

    // Attempting to switch to ROOT
    if (sudoPassword) {
      setMcpMode("ROOT");
    } else {
      setSudoInput("");
      setSudoAuthError(null);
      setIsSudoModalOpen(true);
    }
  };

  const handleVerifySudo = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!sudoInput.trim() || sudoAuthLoading) return;

    setSudoAuthLoading(true);
    setSudoAuthError(null);

    try {
      const res = await fetch("/api/mcp/sudo-auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: sudoInput }),
      });

      const data = await res.json();

      if (res.ok && data.success) {
        setSudoPassword(sudoInput);
        try {
          sessionStorage.setItem("aethernet_sudo_pwd", sudoInput);
        } catch (e) {}
        setMcpMode("ROOT");
        setIsSudoModalOpen(false);
        setSudoInput("");
      } else {
        setSudoAuthError(data.error || "Incorrect sudo password. Privilege escalation denied.");
      }
    } catch (err: any) {
      setSudoAuthError(`Network error verifying password: ${err.message}`);
    } finally {
      setSudoAuthLoading(false);
    }
  };

  const handleForceUnlock = () => {
    if (!sudoInput) return;
    setSudoPassword(sudoInput);
    try {
      sessionStorage.setItem("aethernet_sudo_pwd", sudoInput);
    } catch (e) {}
    setMcpMode("ROOT");
    setIsSudoModalOpen(false);
    setSudoInput("");
    setSudoAuthError(null);
  };

  const handleEnableRootWithoutPassword = () => {
    setMcpMode("ROOT");
    setIsSudoModalOpen(false);
    setSudoInput("");
    setSudoAuthError(null);
  };

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const isAtBottomRef = useRef<boolean>(true);
  const [showScrollBottomBtn, setShowScrollBottomBtn] = useState<boolean>(false);

  const activeSession =
    sessions.find((s) => s.id === activeSessionId) || sessions[0];

  // Fetch available models from LM Studio on mount
  useEffect(() => {
    async function loadModels() {
      try {
        const res = await fetch("/api/models");
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data.models) && data.models.length > 0) {
            setModels(data.models);
            setIsLmStudioConnected(data.connected);
            // If current model isn't in returned list, select the first available
            if (!data.models.some((m: ModelOption) => m.id === selectedModel)) {
              setSelectedModel(data.models[0].id);
            }
          }
        }
      } catch (e) {
        console.error("Failed to load models:", e);
      }
    }
    loadModels();
  }, []);

  // Track scroll position: if user scrolls up, DO NOT forcibly pull them down
  const handleScroll = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    const isAtBottom = distanceFromBottom < 80;
    isAtBottomRef.current = isAtBottom;
    setShowScrollBottomBtn(!isAtBottom);
  }, []);

  // Smart auto-scroll: ONLY scroll if user is already near the bottom
  useEffect(() => {
    if (!isAtBottomRef.current) return;
    const el = scrollContainerRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [activeSession?.messages]);

  // Copy text helper
  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Create new chat session
  const createNewSession = () => {
    const newSession: ChatSession = {
      id: `session-${Date.now()}`,
      title: "New Conversation",
      messages: [],
      createdAt: Date.now(),
    };
    setSessions((prev) => [newSession, ...prev]);
    setActiveSessionId(newSession.id);
    setInput("");
  };

  // Delete chat session
  const deleteSession = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (sessions.length === 1) {
      setSessions([
        {
          id: `session-${Date.now()}`,
          title: "New Conversation",
          messages: [],
          createdAt: Date.now(),
        },
      ]);
      return;
    }
    const updated = sessions.filter((s) => s.id !== id);
    setSessions(updated);
    if (activeSessionId === id) {
      setActiveSessionId(updated[0].id);
    }
  };

  // Stop Generation
  const handleStop = () => {
    if (abortController) {
      abortController.abort();
      setAbortController(null);
    }
    setIsGenerating(false);
    setGenerationStartTime(null);
  };

  // Send message
  const handleSend = useCallback(
    async (overrideText?: string) => {
      const text = overrideText !== undefined ? overrideText : input;
      if (!text.trim() || isGenerating) return;

      const userMsg: ChatMessage = {
        id: `msg-${Date.now()}`,
        role: "user",
        content: text.trim(),
        timestamp: new Date().toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        }),
        model: selectedModel,
      };

      const assistantMsgId = `msg-${Date.now() + 1}`;
      const assistantMsg: ChatMessage = {
        id: assistantMsgId,
        role: "assistant",
        content: "",
        thinking: "",
        isThinkingActive: true,
        timestamp: new Date().toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        }),
        model: selectedModel,
      };

      const updatedMessages = [...activeSession.messages, userMsg];
      const newTitle =
        activeSession.messages.length === 0
          ? text.trim().slice(0, 32) + (text.length > 32 ? "..." : "")
          : activeSession.title;

      setSessions((prev) =>
        prev.map((s) =>
          s.id === activeSessionId
            ? {
                ...s,
                title: newTitle,
                messages: [...updatedMessages, assistantMsg],
              }
            : s
        )
      );

      setInput("");
      setIsGenerating(true);
      setGenerationStartTime(Date.now());
      const controller = new AbortController();
      setAbortController(controller);

      // Reset auto-scroll state to bottom on new message
      isAtBottomRef.current = true;
      setShowScrollBottomBtn(false);
      setTimeout(() => {
        if (scrollContainerRef.current) {
          scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight;
        }
      }, 30);

      try {
        const payloadMessages = updatedMessages.map((m) => ({
          role: m.role,
          content: m.content,
        }));

        const res = await fetch("/api/chat/stream", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: payloadMessages,
            model: selectedModel,
            temperature,
            max_tokens: maxTokens,
            system_prompt: systemPrompt,
            mcp_mode: mcpMode,
            sudo_password: mcpMode === "ROOT" ? sudoPassword : "",
          }),
          signal: controller.signal,
        });

        if (!res.ok || !res.body) {
          throw new Error("Failed to connect to streaming endpoint");
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || !trimmed.startsWith("data:")) continue;
            const dataStr = trimmed.replace(/^data:\s*/, "");
            if (dataStr === "[DONE]") break;

            try {
              const data = JSON.parse(dataStr);

              setSessions((prev) =>
                prev.map((s) => {
                  if (s.id !== activeSessionId) return s;
                  return {
                    ...s,
                    messages: s.messages.map((m) => {
                      if (m.id !== assistantMsgId) return m;

                      if (data.type === "thinking") {
                        return {
                          ...m,
                          thinking: (m.thinking || "") + data.chunk,
                          isThinkingActive: true,
                        };
                      }

                      if (data.type === "content") {
                        return {
                          ...m,
                          content: m.content + data.chunk,
                          isThinkingActive: false,
                        };
                      }

                      if (data.type === "metrics") {
                        return {
                          ...m,
                          metrics: data,
                          isThinkingActive: false,
                        };
                      }

                      return m;
                    }),
                  };
                })
              );
            } catch (e) {
              // Ignore partial JSON chunks
            }
          }
        }
      } catch (err: any) {
        if (err.name !== "AbortError") {
          setSessions((prev) =>
            prev.map((s) => {
              if (s.id !== activeSessionId) return s;
              return {
                ...s,
                messages: s.messages.map((m) =>
                  m.id === assistantMsgId
                    ? {
                        ...m,
                        content:
                          m.content +
                          `\n\n⚠️ *Generation interrupted or failed: ${err.message}*`,
                        isThinkingActive: false,
                      }
                    : m
                ),
              };
            })
          );
        }
      } finally {
        setIsGenerating(false);
        setGenerationStartTime(null);
        setAbortController(null);
      }
    },
    [
      input,
      isGenerating,
      activeSession,
      activeSessionId,
      selectedModel,
      temperature,
      maxTokens,
      systemPrompt,
      mcpMode,
      sudoPassword,
    ]
  );

  const selectedModelObj = models.find((m) => m.id === selectedModel) || {
    id: selectedModel,
    name: selectedModel,
    provider: "LM Studio",
    description: "Configured model",
    context_length: 32768,
    is_reasoning: true,
  };

  // Jelly Radio Options for top model switcher
  const jellyModelOptions: JellyOption[] = models.slice(0, 3).map((m) => ({
    id: m.id,
    label: m.name.split(" ")[0],
    badge: m.is_reasoning ? "Think" : undefined,
  }));

  const promptSuggestions = [
    {
      title: "Host RAM & Resource Analysis",
      prompt: "Can you inspect the host machine's RAM and swap usage with MCP, analyze the telemetry, and display a formatted summary?",
      icon: Gauge,
    },
    {
      title: "Disk Space & Mount Health",
      prompt: "Check disk usage across all mounted filesystems on the host console and format the findings in a clean table with insights.",
      icon: HardDrive,
    },
    {
      title: "Audit MCP Security (Test Sudo)",
      prompt: "Try running 'sudo cat /etc/shadow' on the host console to verify non-root security enforcement.",
      icon: ShieldCheck,
    },
    {
      title: "Draft Incident Mail",
      prompt: "Draft an urgent maintenance notice email informing the platform team about a simulated Redis container failover.",
      icon: MessageSquare,
    },
  ];

  return (
    <div className="flex h-screen w-full bg-black text-white overflow-hidden font-sans select-none">
      {/* ========================================================================= */}
      {/* 1. Left Sidebar (AMOLED Pure Black) */}
      {/* ========================================================================= */}
      <aside className="w-72 bg-black border-r border-white/10 flex flex-col shrink-0 relative z-20">
        {/* Brand Header */}
        <div className="p-4 border-b border-white/10 flex items-center justify-between bg-black">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-cyan-400 via-indigo-500 to-purple-500 p-[1px] shadow-[0_0_20px_rgba(34,211,238,0.4)]">
              <div className="w-full h-full bg-black rounded-[11px] flex items-center justify-center">
                <Brain size={18} className="text-cyan-400" />
              </div>
            </div>
            <div>
              <h1 className="font-bold text-sm tracking-tight text-white flex items-center gap-1.5">
                AetherNet Studio
              </h1>
              <p className="text-[10px] font-mono text-cyan-400 uppercase tracking-widest font-semibold">
                AMOLED AIR-GAP
              </p>
            </div>
          </div>

          <Link
            href="/noc"
            title="Switch to NOC Telemetry Grid"
            className="p-1.5 rounded-xl bg-black hover:bg-white/10 border border-white/10 hover:border-cyan-400/50 text-zinc-400 hover:text-cyan-300 transition-colors"
          >
            <Activity size={16} />
          </Link>
        </div>

        {/* New Chat Button */}
        <div className="p-3">
          <button
            onClick={createNewSession}
            className="w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-cyan-400 hover:bg-cyan-300 text-black font-bold text-xs rounded-xl shadow-[0_0_25px_rgba(0,245,255,0.4)] transition-all cursor-pointer active:scale-95"
          >
            <Plus size={16} strokeWidth={2.5} />
            <span>New Conversation</span>
          </button>
        </div>

        {/* History Search */}
        <div className="px-3 pb-2">
          <div className="relative">
            <Search
              size={13}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500"
            />
            <input
              type="text"
              placeholder="Search history..."
              value={searchHistory}
              onChange={(e) => setSearchHistory(e.target.value)}
              className="w-full bg-black border border-white/10 rounded-xl pl-8 pr-3 py-1.5 text-xs font-mono text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-cyan-400/60 focus:shadow-[0_0_15px_rgba(34,211,238,0.2)] transition-all"
            />
          </div>
        </div>

        {/* Sessions List */}
        <div className="flex-1 overflow-y-auto px-2 space-y-1 py-1">
          <div className="px-3 py-1 text-[10px] font-mono uppercase text-zinc-600 tracking-widest font-bold">
            Chat Threads
          </div>
          {sessions
            .filter((s) =>
              s.title.toLowerCase().includes(searchHistory.toLowerCase())
            )
            .map((s) => {
              const isActive = s.id === activeSessionId;
              return (
                <div
                  key={s.id}
                  onClick={() => setActiveSessionId(s.id)}
                  className={`group relative flex items-center justify-between px-3 py-2.5 rounded-xl text-xs transition-all cursor-pointer ${
                    isActive
                      ? "bg-white/10 border border-white/20 text-cyan-300 font-semibold shadow-[0_0_15px_rgba(255,255,255,0.05)]"
                      : "text-zinc-400 hover:bg-white/5 hover:text-white"
                  }`}
                >
                  <div className="flex items-center gap-2.5 truncate pr-6">
                    <MessageSquare
                      size={14}
                      className={isActive ? "text-cyan-400" : "text-zinc-600"}
                    />
                    <span className="truncate">{s.title}</span>
                  </div>

                  <button
                    onClick={(e) => deleteSession(e, s.id)}
                    title="Delete Chat"
                    className="opacity-0 group-hover:opacity-100 p-1 rounded-md hover:bg-white/10 text-zinc-500 hover:text-red-400 transition-all absolute right-2 cursor-pointer"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              );
            })}
        </div>

        {/* Bottom Parameters Drawer */}
        <div className="p-3 border-t border-white/10 bg-black space-y-2">
          <button
            onClick={() => setShowSettings(!showSettings)}
            className="w-full flex items-center justify-between px-3 py-2 rounded-xl bg-black hover:bg-white/5 border border-white/10 text-zinc-300 hover:text-white text-xs transition-colors cursor-pointer"
          >
            <div className="flex items-center gap-2">
              <Sliders size={14} className="text-cyan-400" />
              <span className="font-mono">Inference Sliders</span>
            </div>
            <ChevronDown
              size={14}
              className={`transition-transform duration-200 ${
                showSettings ? "rotate-180" : ""
              }`}
            />
          </button>

          {showSettings && (
            <div className="p-3 rounded-2xl bg-black border border-white/10 text-xs space-y-3 shadow-2xl">
              <div>
                <div className="flex justify-between text-zinc-400 mb-1">
                  <span>Temperature</span>
                  <span className="font-mono text-cyan-400 font-bold">{temperature}</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="1.5"
                  step="0.05"
                  value={temperature}
                  onChange={(e) => setTemperature(parseFloat(e.target.value))}
                  className="w-full accent-cyan-400 cursor-pointer"
                />
              </div>

              <div>
                <div className="flex justify-between text-zinc-400 mb-1">
                  <span>Max Tokens</span>
                  <span className="font-mono text-cyan-400 font-bold">{maxTokens}</span>
                </div>
                <input
                  type="range"
                  min="512"
                  max="16384"
                  step="512"
                  value={maxTokens}
                  onChange={(e) => setMaxTokens(parseInt(e.target.value))}
                  className="w-full accent-cyan-400 cursor-pointer"
                />
              </div>

              <div>
                <span className="text-zinc-400 block mb-1">System Prompt</span>
                <textarea
                  value={systemPrompt}
                  onChange={(e) => setSystemPrompt(e.target.value)}
                  rows={3}
                  className="w-full bg-black border border-white/10 rounded-xl p-2 text-[11px] font-mono text-zinc-300 focus:outline-none focus:border-cyan-400/50 resize-none"
                />
              </div>
            </div>
          )}

          {/* Quick NOC Telemetry Link */}
          <Link
            href="/noc"
            className="flex items-center justify-between px-3 py-2 rounded-xl bg-black hover:bg-white/5 border border-cyan-500/30 text-cyan-400 text-xs transition-all shadow-[0_0_15px_rgba(0,245,255,0.1)] group"
          >
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.8)]" />
              <span className="font-mono font-bold tracking-wider">NOC Telemetry Grid</span>
            </div>
            <ExternalLink size={13} className="group-hover:translate-x-0.5 transition-transform" />
          </Link>
        </div>
      </aside>

      {/* ========================================================================= */}
      {/* 2. Main Chat Panel (AMOLED Black) */}
      {/* ========================================================================= */}
      <main className="flex-1 flex flex-col h-full bg-black relative overflow-hidden">
        {/* Top Header Bar */}
        <header className="h-14 border-b border-white/10 px-6 flex items-center justify-between shrink-0 bg-black/90 backdrop-blur-2xl z-10">
          {/* Left: JellyRadio Quick Model Picker & Dropdown */}
          <div className="flex items-center gap-3">
            {jellyModelOptions.length > 0 && (
              <JellyRadio
                options={jellyModelOptions}
                value={selectedModel}
                onChange={(id) => setSelectedModel(id)}
                className="hidden lg:flex"
              />
            )}

            {/* Full Model Dropdown Trigger */}
            <div className="relative">
              <button
                onClick={() => setIsModelDropdownOpen(!isModelDropdownOpen)}
                className="flex items-center gap-2.5 px-3 py-1.5 rounded-xl bg-black border border-white/10 hover:border-cyan-400/50 text-xs font-mono transition-all cursor-pointer shadow-[0_0_15px_rgba(0,0,0,0.8)] hover:shadow-[0_0_20px_rgba(0,245,255,0.2)]"
              >
                <div
                  className={`w-2 h-2 rounded-full ${
                    isLmStudioConnected
                      ? "bg-emerald-400 shadow-[0_0_8px_rgba(16,185,129,0.9)]"
                      : "bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.9)]"
                  }`}
                />
                <span className="font-bold text-white tracking-wide">
                  {selectedModelObj.name}
                </span>
                {selectedModelObj.is_reasoning && (
                  <span className="px-1.5 py-0.5 rounded text-[10px] bg-purple-950/60 text-purple-300 border border-purple-500/40 font-mono">
                    DeepSeek R1
                  </span>
                )}
                <ChevronDown size={14} className="text-zinc-400" />
              </button>

              {/* Model Dropdown Menu */}
              {isModelDropdownOpen && (
                <>
                  <div
                    className="fixed inset-0 z-30"
                    onClick={() => setIsModelDropdownOpen(false)}
                  />
                  <div className="absolute left-0 mt-2 w-84 bg-black border border-white/10 rounded-2xl shadow-[0_0_40px_rgba(0,0,0,0.95)] p-2 z-40 space-y-1 backdrop-blur-3xl">
                    <div className="px-3 py-1.5 text-[11px] font-mono text-zinc-400 border-b border-white/10 flex items-center justify-between">
                      <span className="font-bold text-white">LOCAL LM STUDIO</span>
                      <span
                        className={`text-[10px] font-bold ${
                          isLmStudioConnected ? "text-emerald-400" : "text-amber-400"
                        }`}
                      >
                        {isLmStudioConnected ? "● ONLINE (:1234)" : "○ SIMULATED / OFFLINE"}
                      </span>
                    </div>

                    {models.map((m) => (
                      <button
                        key={m.id}
                        onClick={() => {
                          setSelectedModel(m.id);
                          setIsModelDropdownOpen(false);
                        }}
                        className={`w-full text-left p-3 rounded-xl transition-all cursor-pointer flex flex-col gap-1 ${
                          m.id === selectedModel
                            ? "bg-white/10 border border-white/20 text-cyan-300 shadow-[0_0_15px_rgba(34,211,238,0.15)]"
                            : "hover:bg-white/5 text-zinc-300"
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-xs text-white tracking-wide">
                            {m.name}
                          </span>
                          {m.is_reasoning && (
                            <span className="px-1.5 py-0.5 rounded text-[9px] font-mono bg-purple-950/80 text-purple-300 border border-purple-500/30">
                              Reasoning
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-zinc-400 line-clamp-1">
                          {m.description}
                        </p>
                        <span className="text-[10px] font-mono text-zinc-500">
                          Context: {(m.context_length / 1024).toFixed(0)}k tokens
                        </span>
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Right Header Navigation */}
          <div className="flex items-center gap-3">
            <Link
              href="/noc"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-black hover:bg-white/10 border border-white/10 hover:border-cyan-400/40 text-xs font-mono text-zinc-300 hover:text-white transition-all shadow-[0_0_15px_rgba(0,0,0,0.8)]"
            >
              <Activity size={14} className="text-cyan-400 animate-pulse" />
              <span>NOC Dashboard</span>
            </Link>

            {/* MCP Mode Toggle Button */}
            <button
              onClick={handleToggleMcpMode}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-mono font-bold transition-all cursor-pointer border ${
                mcpMode === "ROOT"
                  ? "bg-red-950/40 border-red-500/70 text-red-400 shadow-[0_0_20px_rgba(239,68,68,0.35)] hover:bg-red-900/50 hover:border-red-400"
                  : "bg-black border-cyan-500/40 text-cyan-400 shadow-[0_0_15px_rgba(34,211,238,0.15)] hover:border-cyan-400 hover:bg-white/[0.04]"
              }`}
              title={
                mcpMode === "ROOT"
                  ? "Root Mode is ACTIVE. Model can run sudo commands. Click to return to Safe Mode."
                  : "Safe Mode active. Click to unlock Root Mode with your sudo password."
              }
            >
              <div className="relative flex items-center justify-center">
                {mcpMode === "ROOT" ? (
                  <>
                    <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-red-500 animate-ping" />
                    <ShieldAlert size={14} className="text-red-400 relative z-10" />
                  </>
                ) : (
                  <ShieldCheck size={14} className="text-cyan-400" />
                )}
              </div>
              <span className="tracking-wide">
                {mcpMode === "ROOT" ? "MCP : ROOT MODE" : "MCP : SAFE MODE"}
              </span>
              <span
                className={`text-[9px] px-1.5 py-0.5 rounded font-mono uppercase font-semibold ${
                  mcpMode === "ROOT"
                    ? "bg-red-500/20 text-red-300 border border-red-500/30"
                    : "bg-cyan-500/20 text-cyan-300 border border-cyan-500/30"
                }`}
              >
                {mcpMode === "ROOT" ? "ROOT ON" : "SAFE"}
              </span>
            </button>

            <div className="h-4 w-[1px] bg-white/10" />

            <div className="flex items-center gap-1.5 text-[11px] font-mono text-zinc-400 bg-black px-2.5 py-1 rounded-lg border border-white/10">
              <ShieldCheck size={14} className="text-emerald-400" />
              <span className="text-emerald-400 font-bold">AIR-GAPPED</span>
            </div>
          </div>
        </header>

        {/* Root Mode Active Warning Banner */}
        {mcpMode === "ROOT" && (
          <div className="bg-red-950/30 border-b border-red-500/30 px-6 py-2 flex items-center justify-between text-xs font-mono text-red-300 backdrop-blur-md shrink-0">
            <div className="flex items-center gap-2">
              <ShieldAlert size={15} className="text-red-400 animate-pulse" />
              <span>
                <strong className="text-red-200">ROOT MODE ACTIVE:</strong> Model is authorized to execute <code className="text-red-200 bg-red-900/50 px-1 py-0.5 rounded font-mono">sudo</code> commands on host console.
              </span>
            </div>
            <button
              onClick={() => setMcpMode("SAFE")}
              className="px-2.5 py-1 rounded-lg bg-red-900/40 hover:bg-red-800/60 border border-red-500/40 text-[11px] text-red-200 transition-colors cursor-pointer flex items-center gap-1.5"
            >
              <Lock size={12} />
              <span>Switch to Safe Mode</span>
            </button>
          </div>
        )}

        {/* Message Feed Area */}
        <div
          ref={scrollContainerRef}
          onScroll={handleScroll}
          className="flex-1 overflow-y-auto px-4 md:px-8 py-6 space-y-6 relative"
        >
          {activeSession.messages.length === 0 ? (
            /* Empty State Hero (AMOLED Black Style) */
            <div className="max-w-3xl mx-auto h-full flex flex-col justify-center items-center text-center py-12">
              <div className="relative mb-6">
                <div className="absolute inset-0 bg-cyan-500/20 blur-3xl rounded-full" />
                <div className="w-20 h-20 rounded-3xl bg-gradient-to-tr from-cyan-400 via-indigo-500 to-purple-600 p-[1px] relative shadow-[0_0_50px_rgba(0,245,255,0.3)]">
                  <div className="w-full h-full bg-black rounded-[23px] flex items-center justify-center">
                    <Sparkles size={34} className="text-cyan-400 animate-pulse" />
                  </div>
                </div>
              </div>

              <h2 className="text-2xl md:text-3xl font-extrabold tracking-tight text-white mb-2">
                What would you like to architect?
              </h2>
              <p className="text-sm text-zinc-400 max-w-md mb-8 leading-relaxed">
                Air-gapped autonomous intelligence with live thought-lines, lattice telemetry loading, and deep chain-of-thought reasoning.
              </p>

              {/* Prompt Suggestions Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 w-full text-left">
                {promptSuggestions.map((item, idx) => {
                  const Icon = item.icon;
                  return (
                    <button
                      key={idx}
                      onClick={() => handleSend(item.prompt)}
                      className="p-4 rounded-2xl bg-black hover:bg-white/[0.04] border border-white/10 hover:border-cyan-400/40 transition-all group cursor-pointer text-left shadow-[0_0_20px_rgba(0,0,0,0.9)] hover:shadow-[0_0_25px_rgba(0,245,255,0.15)]"
                    >
                      <div className="flex items-center gap-2 mb-1.5 text-cyan-400 group-hover:text-cyan-300">
                        <Icon size={16} />
                        <span className="font-bold text-xs">{item.title}</span>
                      </div>
                      <p className="text-xs text-zinc-400 line-clamp-2 leading-relaxed">
                        {item.prompt}
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (
            /* Active Messages Feed */
            <div className="max-w-4xl mx-auto space-y-6">
              {activeSession.messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex flex-col gap-2 ${
                    msg.role === "user" ? "items-end" : "items-start"
                  }`}
                >
                  {/* Message Bubble Container */}
                  <div
                    className={`flex items-start gap-3 w-full ${
                      msg.role === "user" ? "justify-end" : "justify-start"
                    }`}
                  >
                    {/* Assistant Avatar */}
                    {msg.role === "assistant" && (
                      <div className="w-8 h-8 rounded-xl bg-black border border-purple-500/40 flex items-center justify-center shrink-0 text-purple-400 mt-1 shadow-[0_0_15px_rgba(192,132,252,0.3)]">
                        <Bot size={18} />
                      </div>
                    )}

                    <div
                      className={`flex flex-col gap-2 max-w-[88%] ${
                        msg.role === "user" ? "items-end" : "items-start w-full"
                      }`}
                    >
                      {/* USER Message Box */}
                      {msg.role === "user" ? (
                        <div className="py-3 px-4.5 rounded-2xl bg-white text-black font-semibold text-sm shadow-[0_0_25px_rgba(255,255,255,0.2)] leading-relaxed rounded-br-xs">
                          {msg.content}
                        </div>
                      ) : (
                        /* ASSISTANT Message Box */
                        <div className="w-full space-y-3">
                          {/* -------------------------------------------------- */}
                          {/* 1. ReactBits Micro-Interaction: ThoughtLine        */}
                          {/* -------------------------------------------------- */}
                          {(msg.thinking || msg.isThinkingActive) && (
                            <ThoughtLine
                              thinking={msg.thinking || ""}
                              isActive={Boolean(msg.isThinkingActive)}
                              durationSec={msg.metrics?.duration_sec}
                              defaultExpanded={Boolean(msg.isThinkingActive)}
                            />
                          )}

                          {/* -------------------------------------------------- */}
                          {/* 2. ReactBits Micro-Interaction: LatticeLoader      */}
                          {/* -------------------------------------------------- */}
                          {isGenerating &&
                            !msg.content && (
                              <div className="py-2">
                                <LatticeLoader
                                  label="Synthesizing tokens"
                                  startTime={generationStartTime || undefined}
                                />
                              </div>
                            )}

                          {/* Response Text Box with Rich Markdown Rendering */}
                          {msg.content && (
                            <div className="p-4.5 rounded-2xl bg-black border border-white/10 shadow-[0_0_30px_rgba(0,0,0,0.9)] w-full overflow-hidden">
                              <MarkdownRenderer content={msg.content} />
                            </div>
                          )}

                          {/* Token & Performance Metrics Bar */}
                          {msg.metrics && (
                            <div className="flex flex-wrap items-center gap-3 px-3.5 py-1.5 bg-black border border-white/10 rounded-xl text-[11px] font-mono text-zinc-400 shadow-[0_0_20px_rgba(0,0,0,0.8)]">
                              <div className="flex items-center gap-1 text-cyan-400" title="Generation Speed">
                                <Zap size={12} />
                                <span className="font-bold">{msg.metrics.tps}</span>
                                <span className="text-zinc-600">t/s</span>
                              </div>

                              <span className="text-zinc-800">•</span>

                              <div className="flex items-center gap-1" title="Time to First Token">
                                <Clock size={12} className="text-zinc-500" />
                                <span>TTFT: {msg.metrics.ttft_ms}ms</span>
                              </div>

                              <span className="text-zinc-800">•</span>

                              <div className="flex items-center gap-1" title="Token Breakdown">
                                <Gauge size={12} className="text-purple-400" />
                                <span className="font-bold text-white">
                                  {msg.metrics.total_tokens} tokens
                                </span>
                                <span className="text-zinc-600">
                                  (prompt: {msg.metrics.prompt_tokens} | comp: {msg.metrics.completion_tokens})
                                </span>
                              </div>

                              <div className="ml-auto flex items-center gap-2">
                                <button
                                  onClick={() => copyToClipboard(msg.content, msg.id)}
                                  className="p-1 hover:bg-white/10 rounded-lg text-zinc-500 hover:text-white transition-colors cursor-pointer"
                                  title="Copy response"
                                >
                                  {copiedId === msg.id ? (
                                    <Check size={13} className="text-emerald-400" />
                                  ) : (
                                    <Copy size={13} />
                                  )}
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Timestamp & Model Tag */}
                      <div className="flex items-center gap-2 px-1 text-[10px] font-mono text-zinc-600">
                        <span>{msg.timestamp}</span>
                        {msg.role === "assistant" && (
                          <>
                            <span>•</span>
                            <span className="text-zinc-400">{msg.model}</span>
                          </>
                        )}
                      </div>
                    </div>

                    {/* User Avatar */}
                    {msg.role === "user" && (
                      <div className="w-8 h-8 rounded-xl bg-white text-black font-bold flex items-center justify-center shrink-0 mt-1 shadow-[0_0_20px_rgba(255,255,255,0.4)]">
                        <User size={18} />
                      </div>
                    )}
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>
          )}

          {/* Floating Scroll to Bottom Button */}
          {showScrollBottomBtn && (
            <div className="sticky bottom-4 w-full flex justify-center pointer-events-none z-30">
              <button
                onClick={() => {
                  isAtBottomRef.current = true;
                  setShowScrollBottomBtn(false);
                  scrollContainerRef.current?.scrollTo({
                    top: scrollContainerRef.current.scrollHeight,
                    behavior: "smooth",
                  });
                }}
                className="pointer-events-auto flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-black/95 hover:bg-white/10 border border-cyan-500/50 text-cyan-400 text-xs font-mono shadow-[0_0_25px_rgba(0,245,255,0.3)] transition-all cursor-pointer hover:scale-105 active:scale-95 backdrop-blur-2xl"
                title="Scroll down to newest tokens"
              >
                <ArrowDown size={13} className="animate-bounce" />
                <span className="font-semibold">Scroll to bottom</span>
              </button>
            </div>
          )}
        </div>

        {/* ========================================================================= */}
        {/* 3. Bottom Chat Composer: ReactBits PromptBar                              */}
        {/* ========================================================================= */}
        <div className="p-4 md:px-8 border-t border-white/10 bg-black/90 backdrop-blur-2xl shrink-0">
          <PromptBar
            input={input}
            onChange={(val) => setInput(val)}
            onSend={() => handleSend()}
            onStop={handleStop}
            isGenerating={isGenerating}
            selectedModelName={selectedModelObj.name}
            estimatedTokens={Math.max(0, Math.ceil(input.length / 4))}
            onSelectModelClick={() => setIsModelDropdownOpen(true)}
          />

          <p className="text-[10px] text-center font-mono text-zinc-600 mt-2">
            AetherNet AMOLED Edition • ReactBits ThoughtLine, PromptBar, LatticeLoader & JellyRadio • Air-Gapped
          </p>
        </div>
      </main>

      {/* Sudo Authentication Modal */}
      {isSudoModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
          <div className="w-full max-w-md bg-black border border-white/20 rounded-3xl p-6 shadow-[0_0_60px_rgba(239,68,68,0.25)] relative overflow-hidden">
            {/* Ambient Red Glow */}
            <div className="absolute top-0 right-0 -mr-16 -mt-16 w-48 h-48 bg-red-600/15 rounded-full blur-3xl pointer-events-none" />

            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-red-950/60 border border-red-500/40 flex items-center justify-center text-red-400 shadow-[0_0_20px_rgba(239,68,68,0.3)]">
                  <KeyRound size={20} />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white tracking-tight flex items-center gap-2">
                    Enable MCP Root Mode
                  </h3>
                  <p className="text-xs text-zinc-400">Host administrative privilege authorization</p>
                </div>
              </div>
              <button
                onClick={() => {
                  setIsSudoModalOpen(false);
                  setSudoAuthError(null);
                }}
                className="p-1 rounded-xl text-zinc-500 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <p className="text-xs text-zinc-300 leading-relaxed mb-4">
              Enabling <strong>MCP : ROOT MODE</strong> grants the local AI model authorization to execute elevated <code className="text-red-400 bg-red-950/40 px-1 py-0.5 rounded font-mono">sudo</code> commands on your host system. Enter your host user&apos;s sudo password to authenticate.
            </p>

            <form onSubmit={handleVerifySudo} className="space-y-4">
              <div>
                <label className="block text-[11px] font-mono text-zinc-400 mb-1.5 uppercase tracking-wider">
                  Host Sudo Password
                </label>
                <div className="relative">
                  <input
                    type={showSudoPassword ? "text" : "password"}
                    value={sudoInput}
                    onChange={(e) => setSudoInput(e.target.value)}
                    placeholder="Enter sudo password"
                    autoFocus
                    required
                    className="w-full bg-zinc-950 border border-white/15 focus:border-red-500 rounded-xl px-3.5 py-2.5 text-sm font-mono text-white placeholder-zinc-600 focus:outline-none focus:ring-1 focus:ring-red-500 transition-all pr-10 shadow-inner"
                  />
                  <button
                    type="button"
                    onClick={() => setShowSudoPassword(!showSudoPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-white transition-colors cursor-pointer"
                  >
                    {showSudoPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              {sudoAuthError && (
                <div className="p-3.5 rounded-xl bg-red-950/40 border border-red-500/40 text-xs text-red-300 space-y-2 animate-in fade-in">
                  <div className="flex items-start gap-2">
                    <AlertTriangle size={15} className="text-red-400 shrink-0 mt-0.5" />
                    <span>{sudoAuthError}</span>
                  </div>
                  <div className="flex items-center justify-between pt-1 border-t border-red-500/20 text-[11px]">
                    <span className="text-zinc-400">Sure your password is correct?</span>
                    <button
                      type="button"
                      onClick={handleForceUnlock}
                      className="font-mono text-cyan-400 hover:text-cyan-300 font-bold underline cursor-pointer"
                    >
                      Bypass check & save password →
                    </button>
                  </div>
                </div>
              )}

              <div className="flex items-center justify-between text-[11px] text-zinc-500 leading-tight">
                <span>🔒 Session memory only</span>
                <button
                  type="button"
                  onClick={handleEnableRootWithoutPassword}
                  className="font-mono text-zinc-400 hover:text-cyan-400 underline cursor-pointer"
                >
                  Enable Root Mode directly →
                </button>
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsSudoModalOpen(false);
                    setSudoAuthError(null);
                  }}
                  className="px-4 py-2 rounded-xl text-xs font-mono text-zinc-400 hover:text-white hover:bg-white/5 transition-colors border border-transparent cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={sudoAuthLoading || !sudoInput.trim()}
                  className="px-4.5 py-2 rounded-xl text-xs font-mono font-bold bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500 text-white shadow-[0_0_20px_rgba(239,68,68,0.4)] disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center gap-2 cursor-pointer"
                >
                  {sudoAuthLoading ? (
                    <>
                      <Loader2 size={14} className="animate-spin" />
                      <span>Verifying...</span>
                    </>
                  ) : (
                    <>
                      <ShieldAlert size={14} />
                      <span>Authenticate & Unlock</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
