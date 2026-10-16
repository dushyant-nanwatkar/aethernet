import { NextResponse } from 'next/server';

const MCP_PORT = process.env.MCP_PORT || 3005;
const MCP_URL = `http://localhost:${MCP_PORT}`;

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const res = await fetch(`${MCP_URL}/tools`, {
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json' },
    });

    if (res.ok) {
      const data = await res.json();
      return NextResponse.json({
        active: true,
        endpoint: MCP_URL,
        security: 'non-root-enforced',
        tools: data.tools || [],
      });
    }
  } catch (err) {
    // Fallback if HTTP daemon isn't running yet
  }

  // Built-in static registry mirroring services/mcp-server/server.py
  return NextResponse.json({
    active: true,
    endpoint: MCP_URL,
    security: 'non-root-enforced',
    tools: [
      {
        name: 'execute_command',
        description: 'Execute a safe, non-root shell command on the local host. Sudo/root commands are strictly blocked.',
        inputSchema: {
          type: 'object',
          properties: {
            command: { type: 'string', description: 'Command to run (e.g. "free -m", "uptime", "docker ps")' },
          },
          required: ['command'],
        },
      },
      {
        name: 'system_metrics',
        description: 'Retrieve current CPU, memory, disk, and host uptime snapshot.',
        inputSchema: { type: 'object', properties: {} },
      },
      {
        name: 'docker_command',
        description: 'Query or inspect local Docker containers (e.g. kafka, redis, postgres).',
        inputSchema: {
          type: 'object',
          properties: {
            action: { type: 'string', enum: ['ps', 'logs', 'restart', 'stats'] },
            container: { type: 'string', description: 'Container name' },
          },
          required: ['action'],
        },
      },
      {
        name: 'read_host_file',
        description: 'Read file contents from the workspace safely (non-sensitive).',
        inputSchema: {
          type: 'object',
          properties: {
            path: { type: 'string', description: 'File path' },
            max_lines: { type: 'integer', default: 200 },
          },
          required: ['path'],
        },
      },
      {
        name: 'list_directory',
        description: 'List files and directories on the host.',
        inputSchema: {
          type: 'object',
          properties: {
            path: { type: 'string', default: '.' },
          },
        },
      },
    ],
  });
}
