#!/bin/bash
# Script de deploy para Neuzalanches
# Uso: ./deploy.sh
# Executa na VPS: ssh root@145.223.31.205 'bash -s' < deploy.sh

set -e

PROJECT_DIR="/var/www/neuzalanches"

echo "=== Deploy Neuzalanches ==="
echo ""

cd "$PROJECT_DIR"

echo "[1/5] Puxando código do GitHub..."
git fetch origin
git reset --hard origin/main
echo "     Commit: $(git log --oneline -1)"

echo "[2/5] Instalando dependências..."
npm install --omit=dev 2>&1 | tail -3

echo "[3/5] Buildando frontend..."
npm run build 2>&1 | tail -5

echo "[4/5] Reiniciando servidor..."
# Mata processos node órfãos que possam estar ocupando a porta 3001
OLD_PID=$(ss -tlnp | grep ':3001' | grep -oP 'pid=\K[0-9]+' | head -1)
if [ -n "$OLD_PID" ]; then
  echo "     Matando processo órfão na porta 3001 (pid $OLD_PID)..."
  kill "$OLD_PID" 2>/dev/null || true
  sleep 1
fi
pm2 restart neuzalanches
sleep 2

echo "[5/5] Verificando status..."
pm2 list | grep neuzalanches

echo ""
echo "=== Deploy concluido! ==="
curl -s http://localhost:3001/api/produtos | head -c 80 && echo "..."
