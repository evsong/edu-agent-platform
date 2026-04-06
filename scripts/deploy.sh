#!/bin/bash
# Deploy EduAgent to win4060
set -e

REMOTE="win4060"
REMOTE_DIR="C:\\Services\\eduagent"

echo "=== EduAgent Deploy ==="

# 1. Build locally
echo "[1/4] Building Docker images..."
docker compose build

# 2. Push to remote
echo "[2/4] Pushing to remote..."
# Option A: If using Docker registry
# docker compose push
# Option B: If direct SSH (default)
ssh $REMOTE "cd $REMOTE_DIR && git pull origin main"

# 3. Deploy on remote
echo "[3/4] Starting services..."
ssh $REMOTE "cd $REMOTE_DIR && docker compose up -d --build"

# 4. Health check
echo "[4/4] Health check..."
sleep 10
ssh $REMOTE "curl -s http://localhost:8000/health | jq ."
ssh $REMOTE "curl -s http://localhost:3000/health | jq ."
ssh $REMOTE "curl -s http://localhost:3001 | head -1"

echo "=== Deploy Complete ==="
echo "Backend:      http://localhost:8000"
echo "Frontend:     http://localhost:3001"
echo "LTI Provider: http://localhost:3000"
