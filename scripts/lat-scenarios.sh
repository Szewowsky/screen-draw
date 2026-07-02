#!/usr/bin/env bash
set -euo pipefail

SMOKE=0
if [[ "${1:-}" == "--smoke" ]]; then
  SMOKE=1
  shift
fi

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_PATH="${SCREEN_DRAW_LAT_APP:-$ROOT/dist/mac-arm64/Screen Draw.app}"
APP_BIN="$APP_PATH/Contents/MacOS/Screen Draw"
USER_DATA="$HOME/Library/Application Support/Screen Draw"
TRIGGER="$USER_DATA/lat-trigger"
LAT_LOG="$USER_DATA/latency.log"
RUN_DIR="${SCREEN_DRAW_LAT_RUN_DIR:-$ROOT/dist/latency-run}"
ITERATIONS="${SCREEN_DRAW_LAT_ITERATIONS:-10}"
ACTIVATION_TIMEOUT_SECONDS="${SCREEN_DRAW_LAT_ACTIVATION_TIMEOUT_SECONDS:-240}"
B_IDLE_SECONDS="${SCREEN_DRAW_LAT_B_IDLE_SECONDS:-90}"
if [[ "$SMOKE" == "1" ]]; then
  F_IDLE_SECONDS="${SCREEN_DRAW_LAT_F_IDLE_SECONDS:-180}"
else
  F_IDLE_SECONDS="${SCREEN_DRAW_LAT_F_IDLE_SECONDS:-600}"
fi

if [[ ! -x "$APP_BIN" ]]; then
  echo "[LAT-SCENARIOS] Missing packaged app executable: $APP_BIN" >&2
  echo "[LAT-SCENARIOS] Build one with: npm run build && npx electron-builder --mac dir --publish never" >&2
  exit 1
fi

mkdir -p "$USER_DATA" "$RUN_DIR"
: >"$LAT_LOG"
: >"$TRIGGER"

STAMP="$(date +%Y%m%d-%H%M%S)"
APP_STDOUT="$RUN_DIR/app-$STAMP.log"
TABLE_OUT="$RUN_DIR/table-$STAMP.md"
: >"$APP_STDOUT"
: >"$TABLE_OUT"

APP_PID=""

cleanup() {
  if [[ -n "$APP_PID" ]] && kill -0 "$APP_PID" 2>/dev/null; then
    printf 'quit\n' >>"$TRIGGER" || true
    sleep 2
    if kill -0 "$APP_PID" 2>/dev/null; then
      kill "$APP_PID" 2>/dev/null || true
    fi
  fi
}
trap cleanup EXIT

activation_count() {
  if [[ ! -f "$LAT_LOG" ]]; then
    echo 0
    return
  fi
  grep -c '^\[LAT-161\] {' "$LAT_LOG" || true
}

wait_for_count() {
  local target="$1"
  local timeout_seconds="${2:-30}"
  local start
  start="$(date +%s)"
  while true; do
    local count
    count="$(activation_count)"
    if (( count >= target )); then
      return 0
    fi
    if (( "$(date +%s)" - start >= timeout_seconds )); then
      echo "[LAT-SCENARIOS] Timed out waiting for $target activation lines; saw $count" >&2
      tail -80 "$APP_STDOUT" >&2 || true
      return 1
    fi
    sleep 0.2
  done
}

wait_for_watcher() {
  local start
  start="$(date +%s)"
  while true; do
    if grep -q '\[LAT-161\] trigger watcher active path=' "$APP_STDOUT"; then
      return 0
    fi
    if (( "$(date +%s)" - start >= 30 )); then
      echo "[LAT-SCENARIOS] Timed out waiting for trigger watcher" >&2
      tail -80 "$APP_STDOUT" >&2 || true
      return 1
    fi
    sleep 0.2
  done
}

trigger() {
  printf '%s\n' "$1" >>"$TRIGGER"
}

run_activation() {
  local before
  before="$(activation_count)"
  trigger toggle
  wait_for_count "$((before + 1))" "$ACTIVATION_TIMEOUT_SECONDS"
  sleep 0.25
  trigger toggle
  sleep 0.35
}

scenario_table() {
  local scenario="$1"
  local skip="$2"
  npx tsx "$ROOT/scripts/lat-report.ts" --scenario "$scenario" --skip "$skip" "$LAT_LOG" |
    tee -a "$TABLE_OUT"
}

run_repeated_activations() {
  local count="$1"
  for ((i = 1; i <= count; i += 1)); do
    run_activation
  done
}

run_scenario() {
  local name="$1"
  shift
  local start_count
  start_count="$(activation_count)"
  echo "[LAT-SCENARIOS] START $name"
  "$@"
  echo "[LAT-SCENARIOS] TABLE $name"
  scenario_table "$name" "$start_count"
  echo "[LAT-SCENARIOS] END $name"
}

scenario_a() {
  run_repeated_activations "$ITERATIONS"
}

scenario_b() {
  trigger hide-main
  sleep "$B_IDLE_SECONDS"
  run_repeated_activations "$ITERATIONS"
}

scenario_c() {
  for ((i = 1; i <= ITERATIONS; i += 1)); do
    open -a Safari
    sleep 1
    run_activation
  done
}

scenario_d() {
  for ((i = 1; i <= ITERATIONS; i += 1)); do
    for ((j = 1; j <= 5; j += 1)); do
      open -a Safari
      sleep 0.2
      open -a Finder
      sleep 0.2
    done
    run_activation
  done
}

scenario_e() {
  for ((i = 1; i <= 10; i += 1)); do
    local before
    before="$(activation_count)"
    trigger toggle
    wait_for_count "$((before + 1))" "$ACTIVATION_TIMEOUT_SECONDS"
    trigger toggle
    sleep 0.1
  done
}

scenario_f() {
  trigger hide-main
  sleep "$F_IDLE_SECONDS"
  run_repeated_activations 3
}

echo "[LAT-SCENARIOS] Launching packaged app: $APP_BIN"
SCREEN_DRAW_LAT=1 "$APP_BIN" >"$APP_STDOUT" 2>&1 &
APP_PID="$!"
wait_for_watcher

run_scenario "A_panel_visible" scenario_a
run_scenario "B_hidden_90s" scenario_b
run_scenario "C_safari_1s" scenario_c
run_scenario "D_safari_finder_switches" scenario_d
run_scenario "E_rapid_cycles" scenario_e
run_scenario "F_hidden_idle" scenario_f

trigger quit
wait "$APP_PID"
APP_PID=""

echo "[LAT-SCENARIOS] app_stdout=$APP_STDOUT"
echo "[LAT-SCENARIOS] latency_log=$LAT_LOG"
echo "[LAT-SCENARIOS] table=$TABLE_OUT"
cat "$TABLE_OUT"
