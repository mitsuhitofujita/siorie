#!/usr/bin/env bash
# Load-reproduce the auth.test.tsx flake (0014-flaky-auth-test-isolation).
#
# Usage: repro.sh <iterations> <single|suite> <load-procs>
#   e.g. repro.sh 20 single 7   # auth.test.tsx alone, 7 cores pinned
#        repro.sh 20 suite  7   # full apps/web suite
#
# Set <load-procs> to (nproc - 1). If the UNMODIFIED file yields 0 failures
# here, the load is too low for this hardware, not proof the flake is gone
# (see plan.md "Difficulties"). Baseline on an 8-core box: ~2/20 with 7.
set -u
ITER="${1:-20}"
MODE="${2:-single}"
LOAD="${3:-7}"

repo_root="$(git -C "$(dirname "$0")" rev-parse --show-toplevel)"
cd "$repo_root/apps/web"

LOAD_PIDS=()
for _ in $(seq 1 "$LOAD"); do
  yes > /dev/null &
  LOAD_PIDS+=($!)
done
cleanup() { for p in "${LOAD_PIDS[@]}"; do kill "$p" 2>/dev/null; done; }
trap cleanup EXIT

if [ "$MODE" = "single" ]; then
  CMD=(pnpm exec vitest run src/lib/auth.test.tsx)
else
  CMD=(pnpm exec vitest run)
fi

log="$(mktemp)"
fail=0
for n in $(seq 1 "$ITER"); do
  if "${CMD[@]}" > "$log" 2>&1; then
    printf 'run %2d/%s: PASS\n' "$n" "$ITER"
  else
    fail=$((fail + 1))
    printf 'run %2d/%s: FAIL\n' "$n" "$ITER"
    grep -E "TypeError|FAIL |Cannot read properties" "$log" | head -5
  fi
done
rm -f "$log"
echo "----"
echo "MODE=$MODE ITER=$ITER LOAD=$LOAD FAILURES=$fail"
