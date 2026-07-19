#!/usr/bin/env bash
INPUT=$(cat)
ACTIVE=$(echo "$INPUT" | jq -r '.stop_hook_active')
[ "$ACTIVE" = "true" ] && exit 0
pnpm test || {
  echo "Tests are failing. Fix them before completing." >&2
  exit 2
}
exit 0