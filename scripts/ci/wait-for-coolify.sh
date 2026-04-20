#!/usr/bin/env bash
# wait-for-coolify.sh
#
# Polls Coolify's application status endpoint until the app reaches a
# terminal state or a timeout elapses. Used by .github/workflows/deploy.yml
# after triggering a deploy to confirm it succeeded.
#
# Required environment:
#   COOLIFY_API_URL    e.g. https://coolify.igortullio.com
#   COOLIFY_API_TOKEN  Bearer token from Coolify → Keys & Tokens
#
# Usage: wait-for-coolify.sh <application-uuid>

set -euo pipefail

UUID="${1:?application UUID is required}"
: "${COOLIFY_API_URL:?COOLIFY_API_URL is required}"
: "${COOLIFY_API_TOKEN:?COOLIFY_API_TOKEN is required}"

TIMEOUT_SECONDS="${TIMEOUT_SECONDS:-300}"
INTERVAL_SECONDS="${INTERVAL_SECONDS:-10}"

start=$(date +%s)
while :; do
  response=$(curl -fsS \
    "${COOLIFY_API_URL}/api/v1/applications/${UUID}" \
    -H "Authorization: Bearer ${COOLIFY_API_TOKEN}")

  status=$(echo "$response" | jq -r '.status // "unknown"')

  echo "[$(date -u +%FT%TZ)] ${UUID} status=${status}"

  case "$status" in
    running:healthy|running)
      echo "::notice::App ${UUID} is ${status}"
      exit 0
      ;;
    exited*|crashed*|failed*|degraded*)
      echo "::error::App ${UUID} entered ${status}"
      exit 1
      ;;
  esac

  now=$(date +%s)
  if (( now - start >= TIMEOUT_SECONDS )); then
    echo "::error::Timeout after ${TIMEOUT_SECONDS}s waiting for ${UUID} (last status: ${status})"
    exit 1
  fi

  sleep "$INTERVAL_SECONDS"
done
