#!/bin/bash
# Serialise headless-Chromium runs across parallel builders on this 4-core Mac.
# Usage: bash /Users/dreamwilson/Desktop/personal-site/tools/shotlock.sh <command...>
# Two slots (two concurrent runs), holder PID recorded; a slot whose holder is
# dead or older than 15 min is reclaimed. Waits print nothing; run with
# SHOTLOCK_VERBOSE=1 to see queue messages on stderr.
SLOTS=(/tmp/wilson-table-shot.lock /tmp/wilson-table-shot.lock.2)
alive() { kill -0 "$1" 2>/dev/null; }
reclaim() { # $1 = slot dir
  local d="$1" pid age
  [ -d "$d" ] || return 0
  pid=$(cat "$d/pid" 2>/dev/null)
  age=$(( $(date +%s) - $(stat -f %m "$d" 2>/dev/null || echo 0) ))
  if { [ -n "$pid" ] && ! alive "$pid"; } || [ "$age" -gt 900 ]; then rm -rf "$d"; fi
}
HELD=""
n=0
while [ -z "$HELD" ]; do
  for d in "${SLOTS[@]}"; do
    reclaim "$d"
    if mkdir "$d" 2>/dev/null; then echo $$ > "$d/pid"; HELD="$d"; break; fi
  done
  [ -n "$HELD" ] && break
  n=$((n+1)); [ -n "$SHOTLOCK_VERBOSE" ] && [ $((n % 15)) -eq 0 ] && echo "shotlock: waiting ($((n*4))s)" >&2
  sleep 4
done
trap 'rm -rf "$HELD"' EXIT INT TERM
"$@"
