import { NextRequest, NextResponse } from 'next/server';
import { spawn } from 'child_process';
import path from 'path';

const MCP_PORT = process.env.MCP_PORT || 3005;
const MCP_URL = `http://localhost:${MCP_PORT}`;

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { name, arguments: toolArgs = {}, mcp_mode, allow_root, sudo_password } = body;

    if (!name) {
      return NextResponse.json({ isError: true, error: 'Missing tool name' }, { status: 400 });
    }

    if (mcp_mode === 'ROOT' || allow_root === true) {
      toolArgs.allow_root = true;
      if (sudo_password && !toolArgs.sudo_password) {
        toolArgs.sudo_password = sudo_password;
      }
    }

    // Try calling running MCP HTTP server first
    try {
      const res = await fetch(`${MCP_URL}/call`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, arguments: toolArgs }),
      });

      if (res.ok) {
        const data = await res.json();
        return NextResponse.json(data);
      }
    } catch (e) {
      // MCP HTTP server not running; execute through direct Python runner with security validation
    }

    // Direct invocation via Python security runner with stdin piping
    const workspaceRoot = path.resolve(process.cwd(), '../..');
    const runnerScript = path.join(workspaceRoot, 'services/mcp-server/runner.py');
    const payloadStr = JSON.stringify({ name, arguments: toolArgs });

    const result = await new Promise<any>((resolve) => {
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
            content: [{ type: 'text', text: 'Error: MCP execution timed out after 30 seconds.' }],
          });
        }
      }, 30000);
    });

    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json(
      {
        isError: true,
        content: [{ type: 'text', text: `MCP Execution Exception: ${err.message}` }],
      },
      { status: 500 }
    );
  }
}
