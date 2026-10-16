"use client";

import React, { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Check, Copy, Terminal } from "lucide-react";

interface MarkdownRendererProps {
  content: string;
  className?: string;
}

export function MarkdownRenderer({ content, className = "" }: MarkdownRendererProps) {
  return (
    <div className={`markdown-content text-[13.5px] leading-relaxed text-zinc-200 select-text ${className}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          // Code Block Component with Copy Button & Language Badge
          code({ node, inline, className: codeClassName, children, ...props }: any) {
            const match = /language-(\w+)/.exec(codeClassName || "");
            const language = match ? match[1] : "";
            const codeString = String(children).replace(/\n$/, "");

            if (!inline && (language || codeString.includes("\n"))) {
              return <CodeBlock language={language} code={codeString} />;
            }

            return (
              <code
                className="bg-white/10 text-cyan-300 font-mono text-[12px] px-1.5 py-0.5 rounded-md border border-white/10"
                {...props}
              >
                {children}
              </code>
            );
          },

          // Headings
          h1: ({ children }) => (
            <h1 className="text-xl font-bold text-white mt-4 mb-2 pb-1 border-b border-white/10 tracking-tight">
              {children}
            </h1>
          ),
          h2: ({ children }) => (
            <h2 className="text-lg font-bold text-white mt-3.5 mb-1.5 flex items-center gap-2 tracking-tight">
              {children}
            </h2>
          ),
          h3: ({ children }) => (
            <h3 className="text-base font-semibold text-cyan-200 mt-3 mb-1 tracking-tight">
              {children}
            </h3>
          ),
          h4: ({ children }) => (
            <h4 className="text-sm font-semibold text-zinc-100 mt-2.5 mb-1">
              {children}
            </h4>
          ),

          // Paragraphs
          p: ({ children }) => (
            <p className="mb-2.5 last:mb-0 leading-relaxed text-zinc-200">
              {children}
            </p>
          ),

          // Lists
          ul: ({ children }) => (
            <ul className="list-disc list-outside pl-5 mb-3 space-y-1 text-zinc-300">
              {children}
            </ul>
          ),
          ol: ({ children }) => (
            <ol className="list-decimal list-outside pl-5 mb-3 space-y-1 text-zinc-300 marker:text-cyan-400 font-sans">
              {children}
            </ol>
          ),
          li: ({ children }) => (
            <li className="leading-relaxed pl-1">{children}</li>
          ),

          // Blockquotes (Alerts & Quotes)
          blockquote: ({ children }) => (
            <blockquote className="border-l-2 border-cyan-400/80 bg-white/[0.03] pl-4 py-2 my-3 rounded-r-xl text-zinc-300 italic">
              {children}
            </blockquote>
          ),

          // Tables
          table: ({ children }) => (
            <div className="overflow-x-auto my-3 border border-white/10 rounded-xl bg-black shadow-lg">
              <table className="w-full text-left border-collapse text-xs font-mono">
                {children}
              </table>
            </div>
          ),
          thead: ({ children }) => (
            <thead className="bg-white/5 border-b border-white/10 text-cyan-300 font-bold uppercase tracking-wider text-[11px]">
              {children}
            </thead>
          ),
          tbody: ({ children }) => (
            <tbody className="divide-y divide-white/5 text-zinc-300">{children}</tbody>
          ),
          tr: ({ children }) => (
            <tr className="hover:bg-white/[0.02] transition-colors">{children}</tr>
          ),
          th: ({ children }) => <th className="p-3">{children}</th>,
          td: ({ children }) => <td className="p-3 align-top">{children}</td>,

          // Horizontal Rule
          hr: () => <hr className="my-4 border-t border-white/10" />,

          // Links
          a: ({ href, children }) => (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-cyan-400 hover:text-cyan-300 underline underline-offset-4 decoration-cyan-400/40 hover:decoration-cyan-300 transition-colors"
            >
              {children}
            </a>
          ),

          // Strong & Emphasis
          strong: ({ children }) => (
            <strong className="font-bold text-white">{children}</strong>
          ),
          em: ({ children }) => (
            <em className="italic text-zinc-300">{children}</em>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

function CodeBlock({ language, code }: { language: string; code: string }) {
  const [copied, setCopied] = useState(false);

  const copyCode = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="my-3 rounded-xl border border-white/10 bg-black overflow-hidden shadow-2xl group">
      {/* Code Block Header */}
      <div className="flex items-center justify-between px-3.5 py-1.5 bg-white/[0.04] border-b border-white/10 text-xs font-mono">
        <div className="flex items-center gap-2 text-zinc-400">
          <Terminal size={13} className="text-cyan-400" />
          <span className="text-[11px] font-semibold text-zinc-300 uppercase tracking-wider">
            {language || "code"}
          </span>
        </div>

        <button
          onClick={copyCode}
          className="flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] font-mono text-zinc-400 hover:text-white hover:bg-white/10 transition-all cursor-pointer"
          title="Copy code"
        >
          {copied ? (
            <>
              <Check size={12} className="text-emerald-400" />
              <span className="text-emerald-400 font-semibold">Copied</span>
            </>
          ) : (
            <>
              <Copy size={12} />
              <span>Copy</span>
            </>
          )}
        </button>
      </div>

      {/* Code Block Body */}
      <div className="p-3.5 overflow-x-auto font-mono text-[12.5px] leading-relaxed text-zinc-200 bg-black select-text">
        <pre className="m-0 font-mono">
          <code>{code}</code>
        </pre>
      </div>
    </div>
  );
}
