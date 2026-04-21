#!/usr/bin/env bash
# Run the integration suite and fail if the wall-clock exceeds BUDGET_SECONDS.
# Invoked by CI. Locally, just run `pnpm test:integration` directly.

set -euo pipefail

BUDGET_SECONDS="${INTEGRATION_BUDGET_SECONDS:-180}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
API_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"

cd "$API_ROOT"

START=$(date +%s)
set +e
pnpm vitest run --config tests/integration/vitest.config.ts
STATUS=$?
set -e
END=$(date +%s)

ELAPSED=$((END - START))
echo ""
echo "Integration suite finished in ${ELAPSED}s (budget: ${BUDGET_SECONDS}s)."

if [ "$STATUS" -ne 0 ]; then
  exit "$STATUS"
fi

if [ "$ELAPSED" -gt "$BUDGET_SECONDS" ]; then
  echo "::error::Integration suite exceeded ${BUDGET_SECONDS}s budget (actual: ${ELAPSED}s)"
  exit 1
fi
