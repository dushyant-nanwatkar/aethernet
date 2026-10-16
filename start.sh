#!/usr/bin/env bash
# ==============================================================================
# ⚡ AetherNet - Master Stack Startup Script ⚡
# Air-Gapped Autonomous Telemetry & Self-Healing Local AI Workspace
# ==============================================================================

set -e

# ANSI Color Codes
CYAN='\033[0;36m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
PURPLE='\033[0;35m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Workspace Root Directory
WORKSPACE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$WORKSPACE_DIR"

echo -e "${CYAN}==========================================================================${NC}"
echo -e "${CYAN}⚡ AetherNet Air-Gapped Telemetry & Local AI NOC Stack ⚡${NC}"
echo -e "${CYAN}==========================================================================${NC}"

# ------------------------------------------------------------------------------
# 1. Environment Setup & Configuration
# ------------------------------------------------------------------------------
if [ -f "$WORKSPACE_DIR/.env" ]; then
    echo -e "${GREEN}✓ Loading environment configuration from .env...${NC}"
    export $(grep -v '^#' "$WORKSPACE_DIR/.env" | xargs)
else
    echo -e "${YELLOW}⚠️  No .env found in root. Using default LM Studio settings...${NC}"
    export LLM_PROVIDER="${LLM_PROVIDER:-lmstudio}"
    export LLM_BASE_URL="${LLM_BASE_URL:-http://localhost:1234/v1}"
    export LLM_MODEL_NAME="${LLM_MODEL_NAME:-local-model}"
fi

echo -e "  - ${PURPLE}LLM Provider:${NC} ${LLM_PROVIDER} (${LLM_BASE_URL})"
echo -e "  - ${PURPLE}Model Name:${NC} ${LLM_MODEL_NAME}"

# Track background PIDs for graceful teardown
PIDS=()

cleanup() {
    echo -e "\n${YELLOW}🛑 Shutting down AetherNet services...${NC}"
    for pid in "${PIDS[@]}"; do
        if kill -0 "$pid" 2>/dev/null; then
            echo -e "  - Terminating process PID $pid..."
            kill "$pid" 2>/dev/null || true
        fi
    done
    echo -e "${GREEN}✅ All background application processes terminated.${NC}"
}
trap cleanup EXIT INT TERM

# ------------------------------------------------------------------------------
# 2. Infrastructure Services (Docker Compose)
# ------------------------------------------------------------------------------
echo -e "\n${BLUE}🚀 [1/4] Starting Docker Infrastructure (Kafka, Redis, Postgres, Qdrant, Ollama)...${NC}"
docker compose -f infra/docker/docker-compose.yml up -d

echo -e "${BLUE}⏳ Waiting for core databases & messaging queues to initialize...${NC}"
check_port() {
    local host=$1
    local port=$2
    local retries=15
    local wait=1
    while [ $retries -gt 0 ]; do
        if (echo > /dev/tcp/$host/$port) >/dev/null 2>&1; then
            return 0
        fi
        sleep $wait
        ((retries--))
    done
    return 1
}

if check_port localhost 9092; then
    echo -e "${GREEN}  ✓ Kafka (port 9092) is READY.${NC}"
    docker exec kafka /opt/kafka/bin/kafka-topics.sh --bootstrap-server localhost:9092 --create --if-not-exists --topic telemetry.raw --partitions 1 --replication-factor 1 >/dev/null 2>&1 || true
else
    echo -e "${YELLOW}  ⚠️ Kafka on port 9092 is warming up...${NC}"
fi

if check_port localhost 6379; then
    echo -e "${GREEN}  ✓ Redis (port 6379) is READY.${NC}"
else
    echo -e "${RED}  ❌ Redis on port 6379 failed to start!${NC}"
fi

if check_port localhost 5432; then
    echo -e "${GREEN}  ✓ Postgres (port 5432) is READY.${NC}"
else
    echo -e "${YELLOW}  ⚠️ Postgres on port 5432 is warming up...${NC}"
fi

if check_port localhost 6333; then
    echo -e "${GREEN}  ✓ Qdrant Vector Engine (port 6333) is READY.${NC}"
else
    echo -e "${YELLOW}  ⚠️ Qdrant on port 6333 is warming up...${NC}"
fi

if check_port localhost 1234; then
    echo -e "${GREEN}  ✓ LM Studio local server (port 1234) detected!${NC}"
else
    echo -e "${YELLOW}  ⚠️ LM Studio server (port 1234) offline. Attempting auto-start via lms CLI...${NC}"
    if [ -f "$HOME/.lmstudio/bin/lms" ]; then
        "$HOME/.lmstudio/bin/lms" server start >/dev/null 2>&1 || true
        sleep 2
        if check_port localhost 1234; then
            echo -e "${GREEN}  ✓ LM Studio server successfully started on port 1234!${NC}"
        fi
    fi
fi

# ------------------------------------------------------------------------------
# 3. Launch Go Telemetry Daemon
# ------------------------------------------------------------------------------
echo -e "\n${BLUE}⚙️ [2/5] Starting Go Hardware Metrics Daemon...${NC}"
if [ -d "services/daemon" ]; then
    (
        cd services/daemon
        if [ -f "aethernet-daemon" ]; then
            exec ./aethernet-daemon
        else
            exec go run .
        fi
    ) &
    PIDS+=($!)
    echo -e "${GREEN}  ✓ Go Daemon running (PID: ${PIDS[-1]})${NC}"
else
    echo -e "${RED}  ❌ Directory services/daemon missing!${NC}"
fi

# ------------------------------------------------------------------------------
# 4. Launch Safe MCP Host Server (Port 3005)
# ------------------------------------------------------------------------------
echo -e "\n${BLUE}🛡️ [3/5] Starting AetherNet Safe MCP Host Server (Non-Root Enforced)...${NC}"
if [ -d "services/mcp-server" ]; then
    (
        cd services/mcp-server
        exec python3 server.py
    ) &
    PIDS+=($!)
    echo -e "${GREEN}  ✓ MCP Host Server running on port 3005 (PID: ${PIDS[-1]})${NC}"
else
    echo -e "${RED}  ❌ Directory services/mcp-server missing!${NC}"
fi

# ------------------------------------------------------------------------------
# 5. Launch Python AI Orchestrator (FastAPI + LangGraph)
# ------------------------------------------------------------------------------
echo -e "\n${BLUE}🧠 [4/5] Starting Python AI Orchestrator...${NC}"
if [ -d "services/orchestrator" ]; then
    (
        cd services/orchestrator
        if [ -d ".venv" ]; then
            source .venv/bin/activate
        fi
        exec python3 -m uvicorn main:app --host 0.0.0.0 --port 8000
    ) &
    PIDS+=($!)
    echo -e "${GREEN}  ✓ Python Orchestrator running (PID: ${PIDS[-1]})${NC}"
else
    echo -e "${RED}  ❌ Directory services/orchestrator missing!${NC}"
fi

# ------------------------------------------------------------------------------
# 6. Launch Next.js NOC UI & WebSocket Server
# ------------------------------------------------------------------------------
echo -e "\n${BLUE}🖥️ [5/5] Starting Next.js NOC Dashboard & Redis PubSub Server...${NC}"
if [ -d "apps/web" ]; then
    (
        cd apps/web
        if [ -f "server.mjs" ]; then
            exec node server.mjs
        else
            exec pnpm dev
        fi
    ) &
    PIDS+=($!)
    echo -e "${GREEN}  ✓ NOC Dashboard running (PID: ${PIDS[-1]})${NC}"
else
    echo -e "${RED}  ❌ Directory apps/web missing!${NC}"
fi

# ------------------------------------------------------------------------------
# Stack Status Summary
# ------------------------------------------------------------------------------
echo -e "\n${CYAN}==========================================================================${NC}"
echo -e "${GREEN}✨ AetherNet Workspace Fully Operational! ✨${NC}"
echo -e "${CYAN}==========================================================================${NC}"
echo -e "  🌐 ${GREEN}NOC Web Dashboard:${NC}    http://localhost:3000"
echo -e "  🧠 ${GREEN}AI Orchestrator API:${NC}  http://localhost:8000/docs"
echo -e "  📡 ${GREEN}Telemetry Stream:${NC}      ws://localhost:3000"
echo -e "  🤖 ${GREEN}LLM Provider:${NC}         ${LLM_PROVIDER} (${LLM_BASE_URL})"
echo -e "${CYAN}==========================================================================${NC}"
echo -e "${YELLOW}Press Ctrl+C to stop all services and exit.${NC}\n"

# Keep script running and wait for background processes
wait
