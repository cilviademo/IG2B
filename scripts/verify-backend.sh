#!/usr/bin/env bash
# Verify the Indigold backend pipeline end-to-end:
#   wake API -> register a device user -> POST a capture -> confirm the worker
#   created a knowledge node (proves Postgres persistence + worker enrichment).
#
# Usage:  scripts/verify-backend.sh [API_BASE_URL]
#   e.g.  scripts/verify-backend.sh https://indigold-api.onrender.com
#
# Run this from YOUR machine (the Render sandbox blocks *.onrender.com).
set -euo pipefail

API="${1:-https://indigold-api.onrender.com}"
echo "▶ API: $API"

echo "▶ Waking API (free plan sleeps ~15 min idle; first hit can take ~60s)…"
for i in $(seq 1 24); do
  code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 30 "$API/health" || echo 000)
  if [ "$code" = "200" ]; then echo "  ✓ awake"; break; fi
  echo "  …waiting ($code)"; sleep 5
done

echo "▶ Readiness (db + kv should be true):"
curl -s --max-time 30 "$API/ready"; echo

EMAIL="verify-$(date +%s)@indigold.local"
PASS="VerifyPass-$(date +%s)A1"
echo "▶ Registering device user $EMAIL …"
REG=$(curl -s --max-time 30 -X POST "$API/auth/register" -H 'content-type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASS\"}")
TOKEN=$(printf '%s' "$REG" | sed -n 's/.*"token":"\([^"]*\)".*/\1/p')
if [ -z "$TOKEN" ]; then echo "  ✗ register failed: $REG"; exit 1; fi
echo "  ✓ token acquired"

echo "▶ Creating a capture (Instagram reel) …"
curl -s --max-time 30 -X POST "$API/captures" \
  -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d '{"type":"instagram_reel","source":"instagram","title":"Verify reel","note":"backend sync test","url":"https://instagram.com/reel/verify","sensitivity":"internal"}'
echo

echo "▶ Polling for the worker-created node (graph persistence) …"
for i in $(seq 1 15); do
  NODES=$(curl -s --max-time 30 "$API/nodes" -H "authorization: Bearer $TOKEN")
  CNT=$(printf '%s' "$NODES" | grep -o '"id"' | wc -l | tr -d ' ')
  echo "  nodes: $CNT"
  if [ "$CNT" != "0" ]; then
    echo "  ✓ PIPELINE OK — node persisted in Postgres:"
    printf '%s\n' "$NODES" | head -c 700; echo
    echo
    echo "▶ Edges (auto-relationships):"; curl -s "$API/edges" -H "authorization: Bearer $TOKEN" | head -c 400; echo
    echo "▶ Usage (token budget counters in Key Value):"; curl -s "$API/usage" -H "authorization: Bearer $TOKEN"; echo
    echo "✅ Backend sync verified."
    exit 0
  fi
  sleep 5
done

echo "⚠ Capture saved but no node yet. The embedded worker only runs while the"
echo "  API is awake (free plan). Keep the tab open / re-run, or set the API to"
echo "  plan: starter for always-on processing. Captures in DB:"
curl -s "$API/captures" -H "authorization: Bearer $TOKEN" | head -c 700; echo
