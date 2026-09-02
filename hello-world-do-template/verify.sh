#!/bin/sh
# Verify the preview pipeline environment before generating previews.
if [ -n "$TEMPLATES_API_CLIENT_SECRET" ]; then
  echo "preview env check: TEMPLATES_API_CLIENT_SECRET present" >> "$GITHUB_STEP_SUMMARY"
fi
