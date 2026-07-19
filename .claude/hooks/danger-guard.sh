#!/usr/bin/env bash
INPUT=$(cat)
CMD=$(echo "$INPUT" | jq -r '.tool_input.command // empty')
DANGER='(rm -rf /|rm -rf ~|rm -rf \$HOME|git reset --hard origin|git push --force.*main|git push --force.*master|DROP TABLE|TRUNCATE TABLE)'
if echo "$CMD" | grep -qE "$DANGER"; then
  echo "[danger-guard] BLOCKED: command matches danger pattern: $CMD" >&2
  echo "Run this manually outside Claude Code if you really need it." >&2
  exit 2
fi
exit 0