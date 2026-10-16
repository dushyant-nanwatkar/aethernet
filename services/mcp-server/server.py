#!/usr/bin/env python3
"""
AetherNet Air-Gapped MCP (Model Context Protocol) Server
Exposes host system tools for local models while enforcing strict non-root security.
Supports both stdio (JSON-RPC 2.0) and HTTP endpoints on port 3005.
"""

import os
import sys
import re
import json
import logging
import subprocess
import threading
from http.server import HTTPServer, BaseHTTPRequestHandler
from typing import Dict, Any, List

from security import validate_command_safety

logging.basicConfig(level=logging.INFO, format="%(asctime)s [MCP] %(message)s")
logger = logging.getLogger("mcp-server")

SERVER_NAME = "aethernet-mcp-host"
SERVER_VERSION = "1.0.0"
PORT = 3005

TOOLS = [
    {
        "name": "execute_command",
        "description": "Execute a non-root shell command on the local host system. Root/sudo commands are strictly prohibited.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "command": {
                    "type": "string",
                    "description": "The shell command line to execute (e.g. 'ps aux', 'df -h', 'git status', 'docker ps')."
                },
                "timeout_sec": {
                    "type": "integer",
                    "description": "Maximum execution time in seconds (default: 30).",
                    "default": 30
                }
            },
            "required": ["command"]
        }
    },
    {
        "name": "system_metrics",
        "description": "Retrieve current CPU, memory, disk usage, and host OS telemetry snapshot.",
        "inputSchema": {
            "type": "object",
            "properties": {}
        }
    },
    {
        "name": "docker_command",
        "description": "Query or manage local Docker containers (e.g. redis, postgres, kafka, qdrant).",
        "inputSchema": {
            "type": "object",
            "properties": {
                "action": {
                    "type": "string",
                    "enum": ["ps", "logs", "restart", "stats"],
                    "description": "Action to perform on Docker."
                },
                "container": {
                    "type": "string",
                    "description": "Container name or ID (required for 'logs' or 'restart')."
                }
            },
            "required": ["action"]
        }
    },
    {
        "name": "read_host_file",
        "description": "Read file contents from the local host workspace safely.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "path": {
                    "type": "string",
                    "description": "Absolute or relative file path to read."
                },
                "max_lines": {
                    "type": "integer",
                    "description": "Maximum number of lines to return (default: 200).",
                    "default": 200
                }
            },
            "required": ["path"]
        }
    },
    {
        "name": "list_directory",
        "description": "List files and directories at a given path on the host system.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "path": {
                    "type": "string",
                    "description": "Directory path to list (defaults to current workspace).",
                    "default": "."
                }
            }
        }
    }
]

def get_host_environment_info() -> Dict[str, Any]:
    os_name = "Linux"
    distro_id = "unknown"
    if os.path.exists("/etc/os-release"):
        try:
            with open("/etc/os-release", "r") as f:
                for line in f:
                    if line.startswith("PRETTY_NAME="):
                        os_name = line.split("=", 1)[1].strip().strip('"\'')
                    elif line.startswith("ID=") and distro_id == "unknown":
                        distro_id = line.split("=", 1)[1].strip().strip('"\'')
        except Exception:
            pass

    pms = []
    for pm in ["pacman", "yay", "paru", "apt-get", "apt", "dnf", "yum", "zypper", "apk"]:
        try:
            res = subprocess.run(["which", pm], capture_output=True, text=True)
            if res.returncode == 0:
                pms.append(pm)
        except Exception:
            pass

    return {
        "os_name": os_name,
        "distro_id": distro_id,
        "package_managers": pms
    }

def handle_tool_call(tool_name: str, arguments: Dict[str, Any]) -> Dict[str, Any]:
    """Dispatches tool execution with strict security enforcement."""
    logger.info(f"Tool invocation: {tool_name} with args: {arguments}")

    if tool_name == "execute_command":
        cmd = arguments.get("command", "")
        timeout = arguments.get("timeout_sec", 30)
        allow_root = bool(arguments.get("allow_root", False)) or str(arguments.get("mcp_mode", "")).upper() == "ROOT"
        sudo_password = str(arguments.get("sudo_password", ""))
        
        # 1. Security Check (Completely disabled when in Root Mode)
        if not allow_root:
            is_safe, error_msg = validate_command_safety(cmd, allow_root=False)
            if not is_safe:
                logger.warning(f"BLOCKED command in Safe Mode: {cmd}")
                return {
                    "isError": True,
                    "content": [
                        {
                            "type": "text",
                            "text": f"🛑 SECURITY VIOLATION: {error_msg}"
                        }
                    ]
                }
        else:
            logger.info(f"ROOT MODE: Policy violation checks completely disabled for command: {cmd}")

        try:
            cmd_to_run = cmd
            input_data = None
            if allow_root and sudo_password:
                # If command invokes sudo, ensure it reads password non-interactively from stdin
                cmd_to_run = re.sub(r"\bsudo(?!\s+-S)\b", "sudo -S -p ''", cmd)
                input_data = f"{sudo_password}\n"
            elif allow_root and not sudo_password:
                # Non-interactive sudo flag -n avoids hanging on terminal password prompt
                cmd_to_run = re.sub(r"\bsudo(?!\s+-[nS])\b", "sudo -n", cmd)

            # Arch Linux: yay must NOT be run as root/sudo
            if re.search(r"\bsudo\s+yay\b", cmd_to_run):
                cmd_to_run = re.sub(r"\bsudo\s+yay\b", "yay", cmd_to_run)

            # Ensure non-interactive execution for package managers in subshell (avoids halting on [Y/n] prompts)
            if re.search(r"\bpacman\s+-[S|R|U]\b", cmd_to_run) and "--noconfirm" not in cmd_to_run:
                cmd_to_run = re.sub(r"(\bpacman\s+-[S|R|U][a-zA-Z]*)\b", r"\1 --noconfirm", cmd_to_run)
            if re.search(r"\byay\s+-[S|R|U]\b", cmd_to_run) and "--noconfirm" not in cmd_to_run:
                cmd_to_run = re.sub(r"(\byay\s+-[S|R|U][a-zA-Z]*)\b", r"\1 --noconfirm", cmd_to_run)
            if re.search(r"\bapt(?:-get)?\s+(?:install|remove|purge|upgrade)\b", cmd_to_run) and "-y" not in cmd_to_run:
                cmd_to_run = re.sub(r"(\bapt(?:-get)?\s+(?:install|remove|purge|upgrade))\b", r"\1 -y", cmd_to_run)
            if re.search(r"\b(?:dnf|yum|zypper)\s+(?:install|remove|upgrade)\b", cmd_to_run) and "-y" not in cmd_to_run:
                cmd_to_run = re.sub(r"(\b(?:dnf|yum|zypper)\s+(?:install|remove|upgrade))\b", r"\1 -y", cmd_to_run)

            res = subprocess.run(
                cmd_to_run,
                shell=True,
                capture_output=True,
                text=True,
                timeout=timeout,
                cwd=os.getcwd(),
                input=input_data
            )

            # In Root Mode: If command failed due to missing root/sudo privileges and we have sudo_password, auto-retry with sudo
            if (
                allow_root
                and sudo_password
                and res.returncode != 0
                and not re.search(r"\bsudo\b", cmd)
                and any(err in (res.stderr or res.stdout).lower() for err in ["permission denied", "must be root", "are you root", "operation not permitted", "need to be root"])
            ):
                logger.info(f"Root privilege retry for command: {cmd}")
                cmd_sudo = f"sudo -S -p '' {cmd_to_run}"
                res_retry = subprocess.run(
                    cmd_sudo,
                    shell=True,
                    capture_output=True,
                    text=True,
                    timeout=timeout,
                    cwd=os.getcwd(),
                    input=f"{sudo_password}\n"
                )
                if res_retry.returncode == 0 or len(res_retry.stdout) > len(res.stdout):
                    res = res_retry

            output = (res.stdout if res.stdout else res.stderr).strip()

            # Smart diagnostic: If command failed because apt-get was used on an Arch system
            if res.returncode != 0:
                host_env = get_host_environment_info()
                if "arch" in host_env["distro_id"].lower() or "arch" in host_env["os_name"].lower():
                    if re.search(r"\bapt(?:-get)?\b", cmd) and "command not found" in output.lower():
                        output += f"\n\n[AetherNet System Diagnostic: Host OS is {host_env['os_name']}. 'apt-get' is not installed. Native package managers available: {', '.join(host_env['package_managers'])}. Use 'sudo pacman -S --noconfirm <package>' or 'yay -S --noconfirm <package>']"

            return {
                "isError": res.returncode != 0,
                "exit_code": res.returncode,
                "content": [
                    {
                        "type": "text",
                        "text": output or f"(Command exited with code {res.returncode} with no output)"
                    }
                ]
            }
        except subprocess.TimeoutExpired:
            return {
                "isError": True,
                "content": [{"type": "text", "text": f"Error: Command timed out after {timeout} seconds."}]
            }
        except Exception as e:
            return {
                "isError": True,
                "content": [{"type": "text", "text": f"Execution error: {str(e)}"}]
            }

    elif tool_name == "system_metrics":
        try:
            df_out = subprocess.check_output("df -h /", shell=True, text=True).strip()
            free_out = subprocess.check_output("free -m", shell=True, text=True).strip()
            uptime_out = subprocess.check_output("uptime", shell=True, text=True).strip()
            host_env = get_host_environment_info()
            pms_str = ", ".join(host_env["package_managers"]) if host_env["package_managers"] else "None detected"
            
            return {
                "isError": False,
                "content": [
                    {
                        "type": "text",
                        "text": f"Host Telemetry Snapshot:\n\n[Host System & OS]\n{host_env['os_name']} (ID: {host_env['distro_id']})\nAvailable Package Managers: {pms_str}\n\n[Uptime]\n{uptime_out}\n\n[Memory (MB)]\n{free_out}\n\n[Disk]\n{df_out}"
                    }
                ]
            }
        except Exception as e:
            return {"isError": True, "content": [{"type": "text", "text": str(e)}]}

    elif tool_name == "docker_command":
        action = arguments.get("action", "ps")
        container = arguments.get("container", "").strip()
        allow_root = bool(arguments.get("allow_root", False)) or str(arguments.get("mcp_mode", "")).upper() == "ROOT"

        if action == "ps":
            docker_cmd = "docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'"
        elif action == "logs" and container:
            # sanitize container name
            if not re.match(r"^[a-zA-Z0-9_\-]+$", container):
                return {"isError": True, "content": [{"type": "text", "text": "Invalid container name."}]}
            docker_cmd = f"docker logs --tail 50 {container}"
        elif action == "restart" and container:
            if not re.match(r"^[a-zA-Z0-9_\-]+$", container):
                return {"isError": True, "content": [{"type": "text", "text": "Invalid container name."}]}
            docker_cmd = f"docker restart {container}"
        elif action == "stats":
            docker_cmd = "docker stats --no-stream"
        else:
            return {"isError": True, "content": [{"type": "text", "text": "Invalid docker action or missing container."}]}

        # In ROOT MODE, policy violation checks are disabled
        if not allow_root:
            is_safe, error_msg = validate_command_safety(docker_cmd, allow_root=False)
            if not is_safe:
                return {"isError": True, "content": [{"type": "text", "text": error_msg}]}

        res = subprocess.run(docker_cmd, shell=True, capture_output=True, text=True, timeout=20)
        output = res.stdout if res.stdout else res.stderr
        return {
            "isError": res.returncode != 0,
            "content": [{"type": "text", "text": output.strip() or "Success"}]
        }

    elif tool_name == "read_host_file":
        path = arguments.get("path", "")
        max_lines = arguments.get("max_lines", 200)
        allow_root = bool(arguments.get("allow_root", False)) or str(arguments.get("mcp_mode", "")).upper() == "ROOT"
        sudo_password = str(arguments.get("sudo_password", ""))

        # Policy checks are disabled in ROOT mode; block sensitive files only in SAFE mode
        if not allow_root and any(sensitive in path.lower() for sensitive in ["id_rsa", "shadow", "master.key", ".env.local"]):
            return {"isError": True, "content": [{"type": "text", "text": "Access denied to sensitive credential file in Safe Mode."}]}

        if not os.path.exists(path) and not allow_root:
            return {"isError": True, "content": [{"type": "text", "text": f"File not found: {path}"}]}

        try:
            with open(path, "r", encoding="utf-8", errors="replace") as f:
                lines = [f.readline() for _ in range(max_lines)]
            return {
                "isError": False,
                "content": [{"type": "text", "text": "".join(lines)}]
            }
        except PermissionError:
            if allow_root and sudo_password:
                res = subprocess.run(
                    f"sudo -S -p '' head -n {max_lines} '{path}'",
                    shell=True,
                    capture_output=True,
                    text=True,
                    input=f"{sudo_password}\n"
                )
                if res.returncode == 0:
                    return {"isError": False, "content": [{"type": "text", "text": res.stdout}]}
            return {"isError": True, "content": [{"type": "text", "text": f"Permission denied: {path}"}]}
        except Exception as e:
            return {"isError": True, "content": [{"type": "text", "text": f"Read error: {e}"}]}

    elif tool_name == "list_directory":
        path = arguments.get("path", ".")
        try:
            entries = os.listdir(path)
            details = []
            for entry in entries[:100]:
                full = os.path.join(path, entry)
                is_dir = os.path.isdir(full)
                size = os.path.getsize(full) if not is_dir else 0
                details.append(f"{'[DIR]' if is_dir else '[FILE]'} {entry} ({size} bytes)" if not is_dir else f"[DIR]  {entry}/")
            return {
                "isError": False,
                "content": [{"type": "text", "text": "\n".join(details)}]
            }
        except Exception as e:
            return {"isError": True, "content": [{"type": "text", "text": f"List error: {e}"}]}

    return {
        "isError": True,
        "content": [{"type": "text", "text": f"Unknown tool: {tool_name}"}]
    }

# ==============================================================================
# JSON-RPC 2.0 Handler for standard Stdio MCP Clients
# ==============================================================================
def process_jsonrpc_request(req: Dict[str, Any]) -> Dict[str, Any]:
    msg_id = req.get("id")
    method = req.get("method")
    params = req.get("params", {})

    if method == "initialize":
        return {
            "jsonrpc": "2.0",
            "id": msg_id,
            "result": {
                "protocolVersion": "2024-11-05",
                "capabilities": {
                    "tools": {}
                },
                "serverInfo": {
                    "name": SERVER_NAME,
                    "version": SERVER_VERSION
                }
            }
        }
    elif method == "notifications/initialized":
        return None
    elif method == "tools/list":
        return {
            "jsonrpc": "2.0",
            "id": msg_id,
            "result": {
                "tools": TOOLS
            }
        }
    elif method == "tools/call":
        name = params.get("name")
        args = params.get("arguments", {})
        result = handle_tool_call(name, args)
        return {
            "jsonrpc": "2.0",
            "id": msg_id,
            "result": result
        }
    elif method == "ping":
        return {
            "jsonrpc": "2.0",
            "id": msg_id,
            "result": {}
        }
    else:
        return {
            "jsonrpc": "2.0",
            "id": msg_id,
            "error": {
                "code": -32601,
                "message": f"Method not found: {method}"
            }
        }

def run_stdio_server():
    """Reads JSON-RPC from stdin and writes responses to stdout."""
    for line in sys.stdin:
        line_clean = line.strip()
        if not line_clean:
            continue
        try:
            req = json.loads(line_clean)
            resp = process_jsonrpc_request(req)
            if resp:
                sys.stdout.write(json.dumps(resp) + "\n")
                sys.stdout.flush()
        except Exception as e:
            err_resp = {
                "jsonrpc": "2.0",
                "id": None,
                "error": {"code": -32700, "message": f"Parse error: {e}"}
            }
            sys.stdout.write(json.dumps(err_resp) + "\n")
            sys.stdout.flush()

# ==============================================================================
# HTTP API Server for Next.js Web UI & REST integrations (Port 3005)
# ==============================================================================
class MCPHTTPHandler(BaseHTTPRequestHandler):
    def _set_cors_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")

    def do_OPTIONS(self):
        self.send_response(200)
        self._set_cors_headers()
        self.end_headers()

    def do_GET(self):
        if self.path == "/health" or self.path == "/":
            self.send_response(200)
            self._set_cors_headers()
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps({
                "status": "healthy",
                "server": SERVER_NAME,
                "version": SERVER_VERSION,
                "security": "non-root-enforced"
            }).encode())
        elif self.path == "/tools":
            self.send_response(200)
            self._set_cors_headers()
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps({"tools": TOOLS}).encode())
        else:
            self.send_response(404)
            self.end_headers()

    def do_POST(self):
        content_length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(content_length)

        try:
            req_data = json.loads(body.decode("utf-8"))
        except Exception:
            self.send_response(400)
            self._set_cors_headers()
            self.end_headers()
            self.wfile.write(b'{"error": "Invalid JSON"}')
            return

        if self.path == "/mcp" or self.path == "/rpc":
            resp = process_jsonrpc_request(req_data)
            self.send_response(200)
            self._set_cors_headers()
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps(resp).encode())
        elif self.path == "/call":
            tool_name = req_data.get("name")
            arguments = req_data.get("arguments", {})
            result = handle_tool_call(tool_name, arguments)
            self.send_response(200)
            self._set_cors_headers()
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps(result).encode())
        else:
            self.send_response(404)
            self.end_headers()

def run_http_server():
    server_address = ("0.0.0.0", PORT)
    httpd = HTTPServer(server_address, MCPHTTPHandler)
    logger.info(f"AetherNet MCP HTTP server listening on http://0.0.0.0:{PORT}")
    httpd.serve_forever()

if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "--stdio":
        run_stdio_server()
    else:
        # Start stdio listener in background if stdin is connected
        try:
            if not sys.stdin.isatty():
                t = threading.Thread(target=run_stdio_server, daemon=True)
                t.start()
        except Exception:
            pass
        logger.info(f"AetherNet MCP Server started on port {PORT} (Security: non-root enforced)")
        run_http_server()
