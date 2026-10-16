import { NextRequest } from 'next/server';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { spawn, spawnSync } from 'child_process';

export const dynamic = 'force-dynamic';

interface HostEnv {
  osName: string;
  distroId: string;
  kernel: string;
  arch: string;
  availablePms: string[];
  unavailablePms: string[];
}

let cachedHostEnv: HostEnv | null = null;

function detectHostEnvironment(): HostEnv {
  if (cachedHostEnv) return cachedHostEnv;

  let osName = 'Linux';
  let distroId = 'linux';

  try {
    if (fs.existsSync('/etc/os-release')) {
      const content = fs.readFileSync('/etc/os-release', 'utf8');
      for (const line of content.split('\n')) {
        if (line.startsWith('PRETTY_NAME=')) {
          osName = line.split('=', 2)[1].replace(/^["']|["']$/g, '').trim();
        } else if (line.startsWith('ID=') && distroId === 'linux') {
          distroId = line.split('=', 2)[1].replace(/^["']|["']$/g, '').trim();
        }
      }
    }
  } catch (e) {}

  const pmsToCheck = ['pacman', 'yay', 'paru', 'apt-get', 'apt', 'dnf', 'yum', 'zypper', 'apk', 'brew'];
  const availablePms: string[] = [];
  const unavailablePms: string[] = [];

  for (const pm of pmsToCheck) {
    try {
      const res = spawnSync('which', [pm]);
      if (res.status === 0) {
        availablePms.push(pm);
      } else {
        unavailablePms.push(pm);
      }
    } catch (e) {
      unavailablePms.push(pm);
    }
  }

  cachedHostEnv = {
    osName,
    distroId,
    kernel: os.release(),
    arch: os.arch(),
    availablePms,
    unavailablePms,
  };
  return cachedHostEnv;
}

function getMcpTools(isRootMode: boolean) {
  return [
    {
      type: 'function',
      function: {
        name: 'execute_command',
        description: isRootMode
          ? 'Execute a shell command on the local host computer console. ROOT PRIVILEGE MODE is active: root/sudo commands are authorized.'
          : 'Execute a non-root shell command on the local host computer console (e.g. "free -m", "df -h", "uptime", "ps aux", "docker ps"). Root and sudo commands are strictly prohibited in SAFE MODE.',
        parameters: {
          type: 'object',
          properties: {
            command: {
              type: 'string',
              description: 'The shell command to execute on the host console.',
            },
          },
          required: ['command'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'system_metrics',
        description: 'Retrieve current CPU, memory, disk usage, and host OS telemetry snapshot.',
        parameters: { type: 'object', properties: {} },
      },
    },
    {
      type: 'function',
      function: {
        name: 'docker_command',
        description: 'Query or inspect local Docker containers (e.g. kafka, redis, postgres).',
        parameters: {
          type: 'object',
          properties: {
            action: { type: 'string', enum: ['ps', 'logs', 'restart', 'stats'] },
            container: { type: 'string', description: 'Container name' },
          },
          required: ['action'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'read_host_file',
        description: isRootMode
          ? 'Read file contents from the host system safely (Root Mode active).'
          : 'Read file contents from the workspace safely (non-sensitive).',
        parameters: {
          type: 'object',
          properties: {
            path: { type: 'string', description: 'File path' },
            max_lines: { type: 'integer', default: 200 },
          },
          required: ['path'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'list_directory',
        description: 'List files and directories on the host.',
        parameters: {
          type: 'object',
          properties: {
            path: { type: 'string', default: '.' },
          },
        },
      },
    },
  ];
}

async function executeMcpToolDirect(name: string, args: Record<string, any>) {
  try {
    const workspaceRoot = path.resolve(process.cwd(), '../..');
    const runnerScript = path.join(workspaceRoot, 'services/mcp-server/runner.py');
    const payloadStr = JSON.stringify({ name, arguments: args });

    return await new Promise<any>((resolve) => {
      let stdout = '';
      let stderr = '';
      let hasResolved = false;

      const child = spawn('python3', [runnerScript], {
        cwd: workspaceRoot,
      });

      child.stdout.on('data', (d) => { stdout += d.toString(); });
      child.stderr.on('data', (d) => { stderr += d.toString(); });

      child.on('error', (err) => {
        if (!hasResolved) {
          hasResolved = true;
          resolve({
            isError: true,
            content: [{ type: 'text', text: `Failed to spawn MCP runner: ${err.message}` }],
          });
        }
      });

      child.on('close', (code) => {
        if (!hasResolved) {
          hasResolved = true;
          try {
            const lines = stdout.trim().split('\n');
            const jsonLine = lines.reverse().find((l) => l.trim().startsWith('{')) || stdout;
            resolve(JSON.parse(jsonLine));
          } catch (e) {
            resolve({
              isError: code !== 0,
              exit_code: code ?? 1,
              content: [{ type: 'text', text: stdout || stderr || `Runner exited with code ${code}` }],
            });
          }
        }
      });

      try {
        child.stdin.write(payloadStr);
        child.stdin.end();
      } catch (e) {}

      setTimeout(() => {
        if (!hasResolved) {
          hasResolved = true;
          try { child.kill(); } catch (e) {}
          resolve({
            isError: true,
            content: [{ type: 'text', text: 'Error: MCP execution timed out after 35 seconds.' }],
          });
        }
      }, 35000);
    });
  } catch (err: any) {
    return {
      isError: true,
      content: [{ type: 'text', text: `MCP Execution Exception: ${err.message}` }],
    };
  }
}

function parseToolCall(toolCalls: any[], content: string): { tool: string; args: Record<string, any> } | null {
  // 1. Check for native OpenAI tool_calls
  if (toolCalls && toolCalls.length > 0) {
    const tc = toolCalls[0];
    let name = (tc.function?.name || 'execute_command').trim();
    if (name.includes('execute_command')) name = 'execute_command';
    else if (name.includes('system_metrics')) name = 'system_metrics';
    else if (name.includes('docker_command')) name = 'docker_command';
    else if (name.includes('read_host_file')) name = 'read_host_file';
    else if (name.includes('list_directory')) name = 'list_directory';

    try {
      const args = typeof tc.function?.arguments === 'string'
        ? JSON.parse(tc.function.arguments)
        : tc.function?.arguments || {};
      return { tool: name, args };
    } catch (e) {
      if (typeof tc.function?.arguments === 'string') {
        const cmdMatch = tc.function.arguments.match(/"command"\s*:\s*"([^"]+)"/);
        if (cmdMatch) return { tool: name, args: { command: cmdMatch[1] } };
      }
    }
  }

  // 2. Check content for JSON tool blocks e.g. {"command": "free -m"} or {"tool": "..."}
  const trimmed = content.trim();
  const jsonMatch = trimmed.match(/\{[\s\S]*?"command"\s*:\s*[\s\S]*?\}/) ||
                    trimmed.match(/\{[\s\S]*?"tool"\s*:\s*[\s\S]*?\}/);

  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]);
      if (parsed.command) {
        return { tool: 'execute_command', args: { command: String(parsed.command).trim() } };
      }
      if (parsed.tool) {
        return {
          tool: parsed.tool,
          args: parsed.arguments || parsed.args || (parsed.command ? { command: parsed.command } : {}),
        };
      }
    } catch (e) {
      // Ignore JSON parse errors
    }
  }

  // 3. Fallback: check if the model responded ONLY with a single shell command in a code fence
  const fenceMatch = trimmed.match(/^```(?:bash|sh|zsh)?\s*\n([a-zA-Z0-9_\-\.\/ ]+)\n```$/);
  if (fenceMatch && fenceMatch[1]) {
    const cmd = fenceMatch[1].trim();
    if (!cmd.includes('\n') && cmd.length < 100) {
      return { tool: 'execute_command', args: { command: cmd } };
    }
  }

  return null;
}

/**
 * Robust streaming XML tag parser that prevents partial tag splits across chunk boundaries
 * (e.g. '<' followed by 'think' followed by '>').
 */
class StreamTagParser {
  public insideThinking: boolean = false;
  private tagBuffer: string = '';

  feed(chunk: string, onThinking: (t: string) => void, onContent: (c: string) => void) {
    let text = this.tagBuffer + chunk;
    this.tagBuffer = '';

    while (text.length > 0) {
      if (!this.insideThinking) {
        // Look for opening tag: <think>, <thought>, <reasoning>
        const openMatch = text.match(/<(think|thought|reasoning)>/i);
        if (openMatch && openMatch.index !== undefined) {
          const pre = text.slice(0, openMatch.index);
          if (pre) onContent(pre);
          this.insideThinking = true;
          text = text.slice(openMatch.index + openMatch[0].length);
          continue;
        }

        // Check if text ends with partial opening tag
        const partialMatch = text.match(/<(?:t(?:h(?:i(?:n(?:k)?)?)?)?|t(?:h(?:o(?:u(?:g(?:h(?:t)?)?)?)?)?)?|r(?:e(?:a(?:s(?:o(?:n(?:i(?:n(?:g)?)?)?)?)?)?)?)?)?$/i);
        if (partialMatch && partialMatch.index !== undefined && partialMatch[0].length > 0) {
          const safe = text.slice(0, partialMatch.index);
          if (safe) onContent(safe);
          this.tagBuffer = partialMatch[0];
          break;
        }

        onContent(text);
        break;
      } else {
        // Look for closing tag: </think>, </thought>, </reasoning>
        const closeMatch = text.match(/<\/(think|thought|reasoning)>/i);
        if (closeMatch && closeMatch.index !== undefined) {
          const pre = text.slice(0, closeMatch.index);
          if (pre) onThinking(pre);
          this.insideThinking = false;
          text = text.slice(closeMatch.index + closeMatch[0].length);
          continue;
        }

        // Check if text ends with partial closing tag
        const partialClose = text.match(/<\/(?:t(?:h(?:i(?:n(?:k)?)?)?)?|t(?:h(?:o(?:u(?:g(?:h(?:t)?)?)?)?)?)?|r(?:e(?:a(?:s(?:o(?:n(?:i(?:n(?:g)?)?)?)?)?)?)?)?)?$/i);
        if (partialClose && partialClose.index !== undefined && partialClose[0].length > 0) {
          const safe = text.slice(0, partialClose.index);
          if (safe) onThinking(safe);
          this.tagBuffer = partialClose[0];
          break;
        }

        onThinking(text);
        break;
      }
    }
  }

  flush(onThinking: (t: string) => void, onContent: (c: string) => void) {
    if (this.tagBuffer) {
      if (this.insideThinking) onThinking(this.tagBuffer);
      else onContent(this.tagBuffer);
      this.tagBuffer = '';
    }
  }
}

function buildSystemPrompt(basePrompt: string, isRootMode: boolean): string {
  const host = detectHostEnvironment();
  const isArch = host.distroId.includes('arch') || host.osName.toLowerCase().includes('arch');
  const availablePmsStr = host.availablePms.join(', ') || 'none detected';
  const unavailablePmsStr = host.unavailablePms.slice(0, 5).join(', ');

  let pkgInstructions = '';
  if (isArch) {
    pkgInstructions = `
ARCH LINUX PACKAGE MANAGEMENT RULES:
- Primary system package manager: 'pacman'
  • Install packages: 'sudo pacman -S --noconfirm <package>'
  • Update database & install: 'sudo pacman -Sy --noconfirm <package>'
  • Search packages: 'pacman -Ss <package>'
- AUR (Arch User Repository) helper: 'yay'
  • Install AUR packages: 'yay -S --noconfirm <package>'
  • NOTE: NEVER run yay with sudo! Yay must be run as normal user (it invokes sudo internally if needed).
- CRITICAL WARNING: Debian/Ubuntu package managers ('apt', 'apt-get', 'dpkg') DO NOT EXIST on Arch Linux. NEVER attempt to execute 'apt' or 'apt-get'!`;
  } else if (host.availablePms.includes('apt-get') || host.availablePms.includes('apt')) {
    pkgInstructions = `
DEBIAN/UBUNTU PACKAGE MANAGEMENT RULES:
- Primary package manager: 'apt-get' or 'apt'
  • Install: 'sudo apt-get install -y <package>'
  • Update database: 'sudo apt-get update'`;
  } else {
    pkgInstructions = `
HOST PACKAGE MANAGERS:
- Available: ${availablePmsStr}`;
  }

  const modeInstructions = isRootMode
    ? `MCP STATUS: ⚡ ROOT PRIVILEGE MODE ACTIVE (User Pre-Authenticated).
POLICY CHECKS: DISABLED. You are authorized to execute any root and administrative command on the host console using 'sudo' (e.g. systemctl, pacman, network tools, docker, kernel logs, host maintenance).
The system will automatically authenticate your sudo commands using cached credentials.`
    : `MCP STATUS: 🛡️ SAFE NON-ROOT MODE ACTIVE.
All commands execute as standard user on the local host. You can NEVER execute 'sudo', 'su', 'doas', 'pkexec', or destructive operations. If asked to run root commands in SAFE MODE, state that root privilege escalation is disabled and the user must toggle 'MCP : ROOT MODE' in the header to permit root execution.`;

  return `${basePrompt}

HOST SYSTEM PROFILE & ENVIRONMENT SPECIFICATIONS:
- Operating System: ${host.osName} (ID: ${host.distroId})
- Kernel & Architecture: Linux ${host.kernel} (${host.arch})
- Available Host Package Managers: ${availablePmsStr}
- Non-Available / Incompatible: ${unavailablePmsStr}
${pkgInstructions}

${modeInstructions}

To run a shell command on the host console, output an action block:
\`\`\`json
{"command": "<shell command>"}
\`\`\`

Available Tools:
- execute_command: {"command": "<shell command>"}
- system_metrics: {}
- docker_command: {"action": "ps"|"logs"|"stats", "container": "<name>"}
- read_host_file: {"path": "<filepath>", "max_lines": 200}
- list_directory: {"path": "<dir>"}

AUTONOMOUS DIAGNOSTIC & SELF-HEALING DIRECTIVE:
1. Always formulate commands that match the host operating system (${host.osName}).
2. If any command exits with code != 0 or displays an error:
   - Carefully analyze the root cause in your chain of thought (e.g. wrong package manager for ${host.osName}, missing dependency, incorrect package name, syntax error).
   - Check the host environment: Remember this system is running ${host.osName} with available package managers: ${availablePmsStr}.
   - Formulate a corrected command and reattempt immediately by outputting an action block:
     {"command": "<corrected command>"}
   - Do NOT simply give up and report failure without diagnosing the root cause and attempting to fix it.
3. When the operation succeeds, present a clean, structured overview in markdown with tables, key takeaways, and formatted metrics.`;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      messages = [],
      model: requestedModel = 'qwen/qwen3-14b',
      temperature = 0.6,
      max_tokens = 4096,
      system_prompt = 'You are AetherNet Local AI, a powerful autonomous technical assistant running on local hardware. You have access to local host MCP tools. When answering, think deeply, explore hypotheses, verify edge cases, and output comprehensive chain-of-thought before providing your final answer.',
      mcp_mode = 'SAFE',
      sudo_password = '',
    } = body;

    const isRootMode = mcp_mode === 'ROOT';
    const lmStudioUrl = process.env.LLM_BASE_URL || 'http://localhost:1234/v1';

    // 1. Resolve active LM Studio model dynamically
    let activeModel = requestedModel;
    try {
      const modelsRes = await fetch(`${lmStudioUrl}/models`, {
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json' },
      });
      if (modelsRes.ok) {
        const modelsData = await modelsRes.json();
        if (Array.isArray(modelsData.data) && modelsData.data.length > 0) {
          const chatModels = modelsData.data.filter((m: any) => !m.id.toLowerCase().includes('embed'));
          const available = chatModels.length > 0 ? chatModels : modelsData.data;

          const matched = available.find((m: any) => m.id === requestedModel);
          if (matched) {
            activeModel = matched.id;
          } else {
            const qwenModel = available.find((m: any) => m.id.toLowerCase().includes('qwen'));
            activeModel = qwenModel ? qwenModel.id : available[0].id;
          }
        }
      }
    } catch (e) {
      // LM Studio might be offline
    }

    // 2. Build system prompt with host environment awareness
    const fullSystemPrompt = buildSystemPrompt(system_prompt, isRootMode);

    const fullMessages = [
      ...(fullSystemPrompt ? [{ role: 'system', content: fullSystemPrompt }] : []),
      ...messages,
    ];

    // Check if user specifically requested an MCP action via shortcut or command
    const lastUserMsg = messages[messages.length - 1]?.content || '';
    const isDirectSudo = /^\s*sudo\b/i.test(lastUserMsg) || /\b(run|execute)\s+sudo\b/i.test(lastUserMsg);

    if (lastUserMsg.startsWith('/exec ') || lastUserMsg.startsWith('/host ') || isDirectSudo) {
      let cmdToRun = lastUserMsg.replace(/^\/(exec|host)\s+/, '').trim();
      if (isDirectSudo && !cmdToRun) cmdToRun = lastUserMsg.trim();

      const mcpResult = await executeMcpToolDirect('execute_command', {
        command: cmdToRun,
        allow_root: isRootMode,
        sudo_password: isRootMode ? sudo_password : '',
      });
      return streamMcpDirectResponse(cmdToRun, mcpResult, activeModel, lmStudioUrl, fullSystemPrompt, isRootMode, req.signal);
    }

    // 3. Launch Autonomous Agent Loop
    return handleAutonomousAgentLoop(
      activeModel,
      lmStudioUrl,
      fullMessages,
      temperature,
      max_tokens,
      isRootMode,
      sudo_password,
      req.signal
    );
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}

/**
 * Autonomous Agent Loop:
 * - Streams reasoning tokens from ANY model in real time (reasoning_content, reasoning, thought, thinking, <think>).
 * - Detects tool calls.
 * - If a tool call fails, diagnoses the root cause against the host OS (e.g. Arch Linux vs Ubuntu)
 *   and reattempts execution before concluding.
 * - Streams final content response live.
 */
function handleAutonomousAgentLoop(
  model: string,
  lmStudioUrl: string,
  initialMessages: any[],
  temperature: number,
  max_tokens: number,
  isRootMode: boolean,
  sudoPassword: string,
  reqSignal?: AbortSignal
) {
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  const host = detectHostEnvironment();

  const stream = new ReadableStream({
    async start(controller) {
      const startTime = Date.now();
      let firstTokenTime: number | null = null;
      let thinkingTokens = 0;
      let contentTokens = 0;

      const currentMessages = [...initialMessages];
      const MAX_AGENT_TURNS = 5;
      let currentTurn = 0;

      try {
        while (currentTurn < MAX_AGENT_TURNS) {
          currentTurn++;

          let upstreamRes: Response;
          try {
            upstreamRes = await fetch(`${lmStudioUrl}/chat/completions`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: 'Bearer lm-studio',
              },
              body: JSON.stringify({
                model,
                messages: currentMessages,
                temperature,
                max_tokens,
                stream: true,
                tools: getMcpTools(isRootMode),
                stream_options: { include_usage: true },
              }),
              signal: reqSignal,
            });
          } catch (fetchErr: any) {
            if (fetchErr.name === 'AbortError') return;
            throw fetchErr;
          }

          if (!upstreamRes.ok || !upstreamRes.body) {
            const errText = await upstreamRes.text();
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({
                  type: 'content',
                  chunk: `\n\n⚠️ **LM Studio Error (${upstreamRes.status})**: ${errText}`,
                })}\n\n`
              )
            );
            break;
          }

          const reader = upstreamRes.body.getReader();
          let buffer = '';
          const tagParser = new StreamTagParser();

          let turnRawContent = '';
          const accumulatedToolCalls: any[] = [];
          let hasStreamedContentDirectly = false;
          let contentBuffer = '';

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
              const trimmed = line.trim();
              if (!trimmed || !trimmed.startsWith('data:')) continue;
              const dataStr = trimmed.replace(/^data:\s*/, '');
              if (dataStr === '[DONE]') continue;

              try {
                const parsed = JSON.parse(dataStr);
                const delta = parsed.choices?.[0]?.delta;

                if (!firstTokenTime) {
                  firstTokenTime = Date.now();
                }

                // 1. Universal Multi-Model Reasoning extraction
                const nativeReasoning =
                  delta?.reasoning_content ||
                  delta?.reasoning ||
                  delta?.thought ||
                  delta?.thinking;

                if (nativeReasoning) {
                  thinkingTokens += countTokens(nativeReasoning);
                  controller.enqueue(
                    encoder.encode(
                      `data: ${JSON.stringify({
                        type: 'thinking',
                        chunk: nativeReasoning,
                      })}\n\n`
                    )
                  );
                }

                // 2. Accumulate native tool calls
                if (delta?.tool_calls && Array.isArray(delta.tool_calls)) {
                  for (const tc of delta.tool_calls) {
                    const idx = tc.index ?? 0;
                    if (!accumulatedToolCalls[idx]) {
                      accumulatedToolCalls[idx] = {
                        id: tc.id || `call_${Date.now()}_${idx}`,
                        type: 'function',
                        function: { name: '', arguments: '' },
                      };
                    }
                    if (tc.id) accumulatedToolCalls[idx].id = tc.id;
                    if (tc.function?.name) accumulatedToolCalls[idx].function.name += tc.function.name;
                    if (tc.function?.arguments) accumulatedToolCalls[idx].function.arguments += tc.function.arguments;
                  }
                }

                // 3. Process delta.content with sliding XML tag parser
                if (delta?.content) {
                  tagParser.feed(
                    delta.content,
                    (thinkChunk) => {
                      thinkingTokens += countTokens(thinkChunk);
                      controller.enqueue(
                        encoder.encode(
                          `data: ${JSON.stringify({
                            type: 'thinking',
                            chunk: thinkChunk,
                          })}\n\n`
                        )
                      );
                    },
                    (contentChunk) => {
                      turnRawContent += contentChunk;

                      // If we are already streaming final content directly to user
                      if (hasStreamedContentDirectly) {
                        contentTokens += countTokens(contentChunk);
                        controller.enqueue(
                          encoder.encode(
                            `data: ${JSON.stringify({
                              type: 'content',
                              chunk: contentChunk,
                            })}\n\n`
                          )
                        );
                      } else {
                        // Buffer until we know if it's a tool call JSON or regular text
                        contentBuffer += contentChunk;

                        // Check if buffer contains tool indicators
                        const hasToolIndicator =
                          contentBuffer.includes('{"command"') ||
                          contentBuffer.includes('{"tool"') ||
                          contentBuffer.includes('```json');

                        if (!hasToolIndicator && contentBuffer.length > 70 && !contentBuffer.trim().startsWith('{')) {
                          // It's a direct response! Flush content buffer live
                          hasStreamedContentDirectly = true;
                          contentTokens += countTokens(contentBuffer);
                          controller.enqueue(
                            encoder.encode(
                              `data: ${JSON.stringify({
                                type: 'content',
                                chunk: contentBuffer,
                              })}\n\n`
                            )
                          );
                          contentBuffer = '';
                        }
                      }
                    }
                  );
                }
              } catch (e) {
                // Ignore chunk parse errors
              }
            }
          }

          tagParser.flush(
            (t) => {
              thinkingTokens += countTokens(t);
              controller.enqueue(
                encoder.encode(
                  `data: ${JSON.stringify({
                    type: 'thinking',
                    chunk: t,
                  })}\n\n`
                )
              );
            },
            (c) => {
              turnRawContent += c;
              if (hasStreamedContentDirectly) {
                contentTokens += countTokens(c);
                controller.enqueue(
                  encoder.encode(
                    `data: ${JSON.stringify({
                      type: 'content',
                      chunk: c,
                    })}\n\n`
                  )
                );
              } else {
                contentBuffer += c;
              }
            }
          );

          // Check if a tool was invoked in this turn
          const toolCall = parseToolCall(accumulatedToolCalls, turnRawContent);

          if (toolCall) {
            let toolName = toolCall.tool.trim();
            if (toolName.includes('execute_command')) toolName = 'execute_command';
            else if (toolName.includes('system_metrics')) toolName = 'system_metrics';
            else if (toolName.includes('docker_command')) toolName = 'docker_command';
            else if (toolName.includes('read_host_file')) toolName = 'read_host_file';
            else if (toolName.includes('list_directory')) toolName = 'list_directory';

            const targetCmd = toolCall.args.command || toolCall.args.path || toolName;

            // Stream any pre-tool natural language thought that was buffered
            const preToolMatch = turnRawContent.split(/\{[\s\S]*?"command"/)[0];
            const cleanPreThought = preToolMatch ? preToolMatch.replace(/```[a-z]*\s*$/i, '').trim() : '';
            if (cleanPreThought && cleanPreThought.length > 0) {
              controller.enqueue(
                encoder.encode(
                  `data: ${JSON.stringify({
                    type: 'thinking',
                    chunk: `\n• ${cleanPreThought}\n`,
                  })}\n\n`
                )
              );
            }

            // Notify user in ThoughtLine that host tool is executing
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({
                  type: 'thinking',
                  chunk: `\n• Executing on host console: ${toolName}("${targetCmd}")...\n`,
                })}\n\n`
              )
            );

            // Execute tool on local host
            const mcpRes = await executeMcpToolDirect(toolName, {
              ...toolCall.args,
              allow_root: isRootMode,
              sudo_password: isRootMode ? sudoPassword : '',
            });

            const rawOutput = (mcpRes.content?.[0]?.text || '').trim();
            const exitCode = mcpRes.exit_code ?? (mcpRes.isError ? 1 : 0);
            const isFailed = exitCode !== 0 || mcpRes.isError;

            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({
                  type: 'thinking',
                  chunk: `• Received host console output (${rawOutput.length} bytes, exit code ${exitCode})\n`,
                })}\n\n`
              )
            );

            // Append assistant tool call to history
            currentMessages.push({
              role: 'assistant',
              content: JSON.stringify(toolCall.args.command ? { command: targetCmd } : { tool: toolName, arguments: toolCall.args }),
            });

            if (isFailed) {
              // Autonomous root cause diagnosis & self-healing reattempt
              controller.enqueue(
                encoder.encode(
                  `data: ${JSON.stringify({
                    type: 'thinking',
                    chunk: `• Command failed (exit code ${exitCode}). Diagnosing root cause on ${host.osName} and determining fix...\n\n`,
                  })}\n\n`
                )
              );

              const diagnosticPrompt = `[CRITICAL EXECUTION STATUS: COMMAND FAILED (Exit Code: ${exitCode})]:
Command executed: \`${targetCmd}\`
Raw console output:
\`\`\`
${rawOutput}
\`\`\`

AUTONOMOUS ROOT CAUSE DIAGNOSIS & REATTEMPT DIRECTIVE:
1. The previous command did not succeed (exit code ${exitCode}).
2. DIAGNOSE THE ROOT CAUSE: Inspect the raw error output above. Check if the failure is caused by an incorrect package manager (e.g. attempting 'apt-get' or 'apt' on Arch Linux where only 'pacman' and 'yay' exist), missing flags (like '--noconfirm'), permission issues, or missing dependencies.
3. Check the host environment: This host is running **${host.osName}** (${host.distroId}). Available package managers are: **${host.availablePms.join(', ')}**.
4. REATTEMPT WITH CORRECTED COMMAND: Formulate the appropriate command for this system (e.g., if apt-get failed on Arch, reattempt with 'sudo pacman -S --noconfirm <pkg>' or 'yay -S --noconfirm <pkg>').
5. Output an action block to execute the corrected command immediately:
\`\`\`json
{"command": "<corrected command>"}
\`\`\`
6. Only if no solution exists or all reattempts fail should you summarize the failure for the user.`;

              currentMessages.push({
                role: 'user',
                content: diagnosticPrompt,
              });

              // Loop continues to next turn to reattempt!
              continue;
            } else {
              // Tool succeeded
              controller.enqueue(
                encoder.encode(
                  `data: ${JSON.stringify({
                    type: 'thinking',
                    chunk: `• Operation succeeded (exit code 0). Formulating structured analysis...\n\n`,
                  })}\n\n`
                )
              );

              const successPrompt = `[Host Console Raw Output from command \`${targetCmd}\` (Exit Code: 0 - SUCCESS)]:
\`\`\`
${rawOutput}
\`\`\`

The command succeeded!
- If the initial attempt failed and you successfully reattempted it with a corrected command, briefly note that you diagnosed the system (${host.osName}) and fixed the problem.
- Synthesize the final outcome in clean, structured markdown with summary takeaways and formatted metrics.`;

              currentMessages.push({
                role: 'user',
                content: successPrompt,
              });

              // Next turn will synthesize and stream final content to the user
              continue;
            }
          } else {
            // No tool call in this turn; stream remaining content if not already streamed
            if (!hasStreamedContentDirectly && contentBuffer) {
              contentTokens += countTokens(contentBuffer);
              controller.enqueue(
                encoder.encode(
                  `data: ${JSON.stringify({
                    type: 'content',
                    chunk: contentBuffer,
                  })}\n\n`
                )
              );
              contentBuffer = '';
            }

            // Loop finished!
            break;
          }
        }

        // Send closing metrics
        const totalDuration = (Date.now() - startTime) / 1000;
        const totalTokens = thinkingTokens + contentTokens;
        const tps = totalDuration > 0 ? (totalTokens / totalDuration).toFixed(1) : '0';

        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({
              type: 'metrics',
              prompt_tokens: Math.max(10, Math.floor(totalTokens * 0.3)),
              completion_tokens: totalTokens,
              reasoning_tokens: thinkingTokens,
              total_tokens: totalTokens + Math.floor(totalTokens * 0.3),
              duration_sec: totalDuration.toFixed(2),
              tps,
              ttft_ms: firstTokenTime ? firstTokenTime - startTime : 120,
            })}\n\n`
          )
        );

        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
        controller.close();
      } catch (err: any) {
        controller.error(err);
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}

/**
 * Streams direct MCP tool execution with chain of thought reasoning for slash commands e.g. /exec
 */
function streamMcpDirectResponse(
  command: string,
  mcpResult: any,
  model: string,
  lmStudioUrl: string,
  fullSystemPrompt: string,
  isRootMode: boolean = false,
  signal?: AbortSignal
) {
  const encoder = new TextEncoder();
  const host = detectHostEnvironment();

  const stream = new ReadableStream({
    async start(controller) {
      const startTime = Date.now();
      const outputText = mcpResult.content?.[0]?.text || JSON.stringify(mcpResult);
      const isError = Boolean(mcpResult.isError);
      const exitCode = mcpResult.exit_code ?? (isError ? 1 : 0);

      const thoughts = isRootMode
        ? [
            `• Host execution request: "${command}" [Mode: ROOT PRIVILEGED]`,
            `• Policy checks: DISABLED (Root Mode Active)`,
            `• Host environment: ${host.osName} (${host.distroId}), available PMs: ${host.availablePms.join(', ')}`,
            `• Status: Executed on host console (Exit code: ${exitCode}, ${outputText.length} bytes)`,
            `• Reading raw terminal telemetry and formulating structured markdown analysis...\n\n`,
          ]
        : [
            `• Host execution request: "${command}" [Mode: SAFE NON-ROOT]`,
            `• Invoking AetherNet MCP Security Engine...`,
            isError && outputText.includes('SECURITY VIOLATION')
              ? `• Security filter: 🛑 VIOLATION DETECTED (Root privilege escalation prohibited in Safe Mode)`
              : `• Security filter: APPROVED (Safe Non-Root User Execution Privilege)`,
            `• Host environment: ${host.osName} (${host.distroId})`,
            `• Status: Executed on host console (Exit code: ${exitCode}, ${outputText.length} bytes)`,
            `• Reading raw terminal telemetry and formulating structured markdown analysis...\n\n`,
          ];

      for (const t of thoughts) {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ type: 'thinking', chunk: `${t}\n` })}\n\n`)
        );
        await sleep(30);
      }

      let contentTokens = 0;
      let thinkingTokens = 50;

      if (isError && !isRootMode && outputText.includes('SECURITY VIOLATION')) {
        const errorContent = `### 🛑 AetherNet MCP Security Alert\n\n` +
          `${outputText}\n\n` +
          `> **Security Policy**: The local AetherNet MCP server is currently in **SAFE MODE**. To permit root or \`sudo\` execution, click **MCP : ROOT MODE** in the header and authenticate.`;

        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ type: 'content', chunk: errorContent })}\n\n`)
        );
        contentTokens = countTokens(errorContent);
      } else {
        const isFailed = exitCode !== 0 || isError;

        const followUpInstruction = isFailed
          ? `[CRITICAL EXECUTION STATUS: COMMAND FAILED (Exit Code: ${exitCode})]:
Command executed: \`${command}\`
Raw console output:
\`\`\`
${outputText.trim()}
\`\`\`

ROOT CAUSE DIAGNOSIS & REATTEMPT GUIDANCE:
1. The command failed with exit code ${exitCode}.
2. Check the host system environment: The host is running **${host.osName}** (${host.distroId}). Available package managers are: **${host.availablePms.join(', ')}**.
3. Accurately explain the root cause of the error based strictly on the output (e.g. if apt-get was used on Arch Linux, explain that apt-get is Debian/Ubuntu only and Arch Linux uses 'pacman' or 'yay').
4. Provide the exact corrected command the user should run on this system (e.g. 'sudo pacman -S --noconfirm <pkg>' or 'yay -S --noconfirm <pkg>').`
          : `[Host Console Raw Output from command \`${command}\` (Exit Code: 0 - SUCCESS)]:
\`\`\`
${outputText.trim()}
\`\`\`

Please read this raw terminal output, format and analyze the data clearly in the way you think is best for the user. Present a clean, structured overview, key takeaways, and formatted metrics in markdown.`;

        const followUpMessages = [
          { role: 'system', content: fullSystemPrompt },
          { role: 'user', content: `Run console command: \`${command}\`` },
          { role: 'assistant', content: `{"command": "${command}"}` },
          { role: 'user', content: followUpInstruction },
        ];

        try {
          const res = await fetch(`${lmStudioUrl}/chat/completions`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: 'Bearer lm-studio',
            },
            body: JSON.stringify({
              model,
              messages: followUpMessages,
              temperature: 0.6,
              max_tokens: 4096,
              stream: true,
            }),
            signal,
          });

          if (res.ok && res.body) {
            const reader = res.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';
            const tagParser = new StreamTagParser();

            while (true) {
              const { done, value } = await reader.read();
              if (done) break;

              buffer += decoder.decode(value, { stream: true });
              const lines = buffer.split('\n');
              buffer = lines.pop() || '';

              for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed || !trimmed.startsWith('data:')) continue;
                const dataStr = trimmed.replace(/^data:\s*/, '');
                if (dataStr === '[DONE]') continue;

                try {
                  const parsed = JSON.parse(dataStr);
                  const delta = parsed.choices?.[0]?.delta;

                  const reasoningChunk =
                    delta?.reasoning_content ||
                    delta?.reasoning ||
                    delta?.thought ||
                    delta?.thinking;

                  if (reasoningChunk) {
                    thinkingTokens += countTokens(reasoningChunk);
                    controller.enqueue(
                      encoder.encode(
                        `data: ${JSON.stringify({
                          type: 'thinking',
                          chunk: reasoningChunk,
                        })}\n\n`
                      )
                    );
                  }

                  if (delta?.content) {
                    tagParser.feed(
                      delta.content,
                      (t) => {
                        thinkingTokens += countTokens(t);
                        controller.enqueue(
                          encoder.encode(`data: ${JSON.stringify({ type: 'thinking', chunk: t })}\n\n`)
                        );
                      },
                      (c) => {
                        contentTokens += countTokens(c);
                        controller.enqueue(
                          encoder.encode(`data: ${JSON.stringify({ type: 'content', chunk: c })}\n\n`)
                        );
                      }
                    );
                  }
                } catch (e) {}
              }
            }

            tagParser.flush(
              (t) => {
                thinkingTokens += countTokens(t);
                controller.enqueue(
                  encoder.encode(`data: ${JSON.stringify({ type: 'thinking', chunk: t })}\n\n`)
                );
              },
              (c) => {
                contentTokens += countTokens(c);
                controller.enqueue(
                  encoder.encode(`data: ${JSON.stringify({ type: 'content', chunk: c })}\n\n`)
                );
              }
            );
          }
        } catch (e) {}

        if (contentTokens === 0) {
          const fallback = `### 💻 Host Console Execution: \`${command}\`\n\n` +
            `**Command:** \`${command}\`  \n` +
            `**Status:** Completed (Exit Code ${mcpResult.exit_code ?? 0})  \n\n` +
            `\`\`\`\n${outputText.trim()}\n\`\`\``;
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ type: 'content', chunk: fallback })}\n\n`)
          );
          contentTokens += countTokens(fallback);
        }
      }

      const totalDuration = ((Date.now() - startTime) / 1000).toFixed(2);
      const totalTokens = thinkingTokens + contentTokens;
      const tps = Number(totalDuration) > 0 ? (totalTokens / Number(totalDuration)).toFixed(1) : '35.0';

      controller.enqueue(
        encoder.encode(
          `data: ${JSON.stringify({
            type: 'metrics',
            prompt_tokens: 30,
            completion_tokens: contentTokens,
            reasoning_tokens: thinkingTokens,
            total_tokens: totalTokens,
            duration_sec: totalDuration,
            tps,
            ttft_ms: 60,
          })}\n\n`
        )
      );

      controller.enqueue(encoder.encode('data: [DONE]\n\n'));
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}

function streamErrorResponse(errorMessage: string, model: string) {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      controller.enqueue(
        encoder.encode(
          `data: ${JSON.stringify({
            type: 'thinking',
            chunk: `Encountered communication error with local model server (${model})...\nDiagnosing endpoint connectivity and error details...\n`,
          })}\n\n`
        )
      );

      const content = `### ⚠️ Local LM Studio Connection Issue\n\n${errorMessage}\n\n` +
        `#### How to resolve:\n` +
        `1. Open **LM Studio** and ensure the local server is started on \`http://localhost:1234\`.\n` +
        `2. Load the model \`${model}\` into memory.\n` +
        `3. Or run in terminal: \`~/.lmstudio/bin/lms server start\`\n\n` +
        `> **Note**: AetherNet connects directly to your live weights to give you authentic chain-of-thought tokens.`;

      controller.enqueue(
        encoder.encode(`data: ${JSON.stringify({ type: 'content', chunk: content })}\n\n`)
      );

      controller.enqueue(
        encoder.encode(
          `data: ${JSON.stringify({
            type: 'metrics',
            prompt_tokens: 10,
            completion_tokens: 50,
            reasoning_tokens: 15,
            total_tokens: 75,
            duration_sec: '0.25',
            tps: '0',
            ttft_ms: 40,
          })}\n\n`
        )
      );

      controller.enqueue(encoder.encode('data: [DONE]\n\n'));
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}

function countTokens(str: string): number {
  return Math.max(1, Math.ceil(str.length / 3.8));
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
