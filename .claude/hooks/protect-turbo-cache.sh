#!/usr/bin/env bash

# Hook to protect turbo cache from accidental deletion or force clearing
# This hook blocks:
# 1. Any turbo command with --force flag
# 2. Any rm command targeting .turbo directory
# 3. Any git clean command that would affect .turbo

# Read the tool call from stdin
TOOL_CALL=$(cat)

# Extract the tool name and parameters
TOOL_NAME=$(echo "$TOOL_CALL" | jq -r '.tool.name // empty')
COMMAND=$(echo "$TOOL_CALL" | jq -r '.tool.parameters.command // empty')

# Only check Bash tool calls
if [ "$TOOL_NAME" != "Bash" ]; then
  exit 0
fi

# Check for turbo with --force
if echo "$COMMAND" | grep -q "turbo" && echo "$COMMAND" | grep -qE "(--force|-f[[:space:]]|--force=)"; then
  echo "❌ BLOCKED: Turbo cache protection enabled!"
  echo "   Using --force with turbo is disabled to protect the cache."
  echo "   If you suspect cache behavior is incorrect, use /turbo-emergency to diagnose configuration issues."
  exit 1
fi

# Check for rm commands targeting .turbo
if echo "$COMMAND" | grep -q "rm" && echo "$COMMAND" | grep -qE "\.turbo(/|$)"; then
  echo "❌ BLOCKED: Turbo cache protection enabled!"
  echo "   Deleting .turbo directory is disabled to protect the cache."
  echo "   If you suspect cache behavior is incorrect, use /turbo-emergency to diagnose configuration issues."
  exit 1
fi

# Check for git clean commands that would affect .turbo (though it should be gitignored)
if echo "$COMMAND" | grep -qE "git[[:space:]]+clean.*-[xXdf]"; then
  echo "⚠️  WARNING: git clean detected - ensure .turbo is in .gitignore"
fi

# Allow the command
exit 0
