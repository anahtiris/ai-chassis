#!/usr/bin/env bash
INPUT=$(cat)
FILE=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')
[ -z "$FILE" ] && exit 0
pnpm exec prettier --write "$FILE" 2>/dev/null
pnpm exec eslint --fix "$FILE" 2>/dev/null
exit 0