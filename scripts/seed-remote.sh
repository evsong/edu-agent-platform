#!/bin/bash
# Run seed data on remote server
set -e

REMOTE="win4060"
REMOTE_DIR="C:\\Services\\eduagent"

echo "Running seed script on $REMOTE..."
ssh $REMOTE "cd $REMOTE_DIR && docker compose exec backend python -m data.seed"
echo "Seed complete!"
