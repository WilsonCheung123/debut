#!/bin/bash
# Serialise headless-Chromium runs across parallel builders on this 4-core Mac.
# Usage: bash /Users/dreamwilson/Desktop/personal-site/tools/shotlock.sh <command...>
# Takes a global mkdir lock (stale after 20 min), runs the command, releases.
LOCK=/tmp/wilson-table-shot.lock
age() { echo $(( $(date +%s) - $(stat -f %m "$LOCK" 2>/dev/null || echo 0) )); }
while ! mkdir "$LOCK" 2>/dev/null; do
  if [ "$(age)" -gt 1200 ]; then rm -rf "$LOCK"; continue; fi
  sleep 4
done
trap 'rm -rf "$LOCK"' EXIT INT TERM
"$@"
