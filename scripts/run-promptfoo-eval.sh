#!/usr/bin/env bash
set -o pipefail

mkdir -p .promptfoo
node scripts/golden-to-promptfoo.mjs
promptfoo eval "$@" -o .promptfoo/latest-eval.json
eval_status=$?

node scripts/append-promptfoo-results.mjs
report_status=$?

if [ "$eval_status" -ne 0 ]; then
  exit "$eval_status"
fi
exit "$report_status"
