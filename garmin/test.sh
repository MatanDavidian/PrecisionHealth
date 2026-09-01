#!/usr/bin/env bash
#
# Run the probe inside the Connect IQ simulator and print what it produced.
#
# This cannot say what History.calories MEANS — the simulator's activity data
# is invented. What it does say, before anything is sideloaded, is whether the
# code runs at all on an fr265 profile: whether the API surface this build
# assumes is really there, whether any guarded read throws anyway, and whether
# the report comes back with lines in it.
#
# The simulator must already be running:  <sdk>/bin/connectiq &
#
set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
DEVICE="${1:-fr265}"
KEY="${DEVELOPER_KEY:-$HOME/.Garmin/developer_key}"
SDK_ROOT="$HOME/Library/Application Support/Garmin/ConnectIQ"
SDK="$(ls -d "$SDK_ROOT"/Sdks/*/ 2>/dev/null | sort -V | tail -1)"

if [ -z "$SDK" ] || [ ! -x "$SDK/bin/monkeyc" ]; then
  echo "No Connect IQ SDK found under $SDK_ROOT/Sdks"; exit 1
fi

if ! pgrep -f "ConnectIQ.app/Contents/MacOS/simulator" >/dev/null; then
  echo "Starting the simulator..."
  nohup "$SDK/bin/connectiq" >/dev/null 2>&1 &
  sleep 12
fi

mkdir -p "$HERE/bin"
OUT="$HERE/bin/test-$DEVICE.prg"

# -t compiles the (:test) functions in; without it none of them reach the build,
# and nothing under source/ProbeTest.mc ever ships to a watch.
"$SDK/bin/monkeyc" -d "$DEVICE" -f "$HERE/monkey.jungle" -o "$OUT" -y "$KEY" -t -w || exit 1

pkill -f monkeydo 2>/dev/null
sleep 1
LOG="$(mktemp)"
"$SDK/bin/monkeydo" "$OUT" "$DEVICE" -t > "$LOG" 2>&1 &
# monkeydo stays attached to the simulator, so the output is polled rather than
# waited on.
for _ in $(seq 1 30); do
  sleep 1
  grep -q "PASSED\|FAILED" "$LOG" && break
done
pkill -f monkeydo 2>/dev/null
cat "$LOG"
rm -f "$LOG"
