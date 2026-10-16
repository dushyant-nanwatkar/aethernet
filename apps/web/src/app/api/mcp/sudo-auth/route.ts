import { NextRequest, NextResponse } from 'next/server';
import { spawn } from 'child_process';
import path from 'path';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { password } = body;

    if (!password || typeof password !== 'string') {
      return NextResponse.json({ success: false, error: 'Password is required' }, { status: 400 });
    }

    const workspaceRoot = path.resolve(process.cwd(), '../..');
    const verifierScript = path.join(workspaceRoot, 'services/mcp-server/verify_sudo.py');

    const isValid = await new Promise<boolean>((resolve) => {
      let hasResolved = false;

      const child = spawn('python3', [verifierScript], {
        cwd: workspaceRoot,
      });

      child.on('error', () => {
        if (!hasResolved) {
          hasResolved = true;
          resolve(false);
        }
      });

      child.on('close', (code) => {
        if (!hasResolved) {
          hasResolved = true;
          resolve(code === 0);
        }
      });

      try {
        child.stdin.write(password);
        child.stdin.end();
      } catch (e) {
        if (!hasResolved) {
          hasResolved = true;
          resolve(false);
        }
      }

      setTimeout(() => {
        if (!hasResolved) {
          hasResolved = true;
          try {
            child.kill();
          } catch (e) {}
          resolve(false);
        }
      }, 7000);
    });

    if (isValid) {
      return NextResponse.json({ success: true, message: 'Root privilege authenticated successfully' });
    } else {
      return NextResponse.json(
        {
          success: false,
          error: 'Sudo authentication returned code 1. Check for typos or active PAM faillock.',
        },
        { status: 401 }
      );
    }
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
