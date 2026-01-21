#!/bin/bash

# Script to install pre-commit security hook
# This hook checks for sensitive information before each commit

# Find git repository root
GIT_DIR=$(git rev-parse --git-dir 2>/dev/null)

if [ -z "$GIT_DIR" ]; then
    echo "❌ Error: Not in a git repository"
    exit 1
fi

HOOK_FILE="$GIT_DIR/hooks/pre-commit"

# Check if hook already exists
if [ -f "$HOOK_FILE" ]; then
    echo "⚠️  Pre-commit hook already exists at: $HOOK_FILE"
    read -p "Overwrite? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "Cancelled"
        exit 0
    fi
fi

# Create hooks directory if it doesn't exist
mkdir -p "$(dirname "$HOOK_FILE")"

# Copy hook from repository if it exists
if [ -f "$(git rev-parse --show-toplevel)/.git/hooks/pre-commit" ]; then
    cp "$(git rev-parse --show-toplevel)/.git/hooks/pre-commit" "$HOOK_FILE"
    echo "✅ Hook copied from repository"
else
    echo "⚠️  Hook template not found in repository"
    echo "Please ensure the hook is installed in the main repository first"
    exit 1
fi

# Make it executable
chmod +x "$HOOK_FILE"

echo "✅ Pre-commit hook installed successfully at: $HOOK_FILE"
echo ""
echo "The hook will now check for sensitive information on every commit."
echo ""
echo "To test:"
echo "  echo 'privateKey: \"0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef\"' > test.yaml"
echo "  git add test.yaml"
echo "  git commit -m 'test'  # Should be blocked"
