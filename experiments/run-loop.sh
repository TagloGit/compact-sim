#!/bin/bash
#
# Ralph loop for autonomous compaction strategy research.
#
# Usage: ./experiments/run-loop.sh [max_iterations] [budget_per_iteration]
#
# Examples:
#   ./experiments/run-loop.sh              # 20 iterations, $5 each
#   ./experiments/run-loop.sh 5 2.00       # 5 iterations, $2 each
#
# Control:
#   touch experiments/PAUSE    # stop after current iteration finishes
#   rm experiments/PAUSE       # allow loop to continue
#

MAX_ITERATIONS=${1:-20}
BUDGET_PER_ITERATION=${2:-5.00}
iteration=0

echo "Starting research loop: $MAX_ITERATIONS iterations, \$$BUDGET_PER_ITERATION budget each"
echo "To pause: touch experiments/PAUSE"
echo ""

while [ $iteration -lt $MAX_ITERATIONS ]; do
  iteration=$((iteration + 1))
  echo "=== Iteration $iteration / $MAX_ITERATIONS ==="

  claude -p "$(cat experiments/AGENT_PROMPT.md)" \
    --model sonnet \
    --dangerously-skip-permissions \
    --max-turns 50 \
    --max-budget-usd "$BUDGET_PER_ITERATION" \
    --output-format json \
    > "experiments/data/session-${iteration}.json"

  echo "Iteration $iteration complete."

  # Check for pause signal
  if [ -f experiments/PAUSE ]; then
    echo "Pause signal detected. Remove experiments/PAUSE to continue."
    break
  fi
done

echo "Research loop finished after $iteration iterations."
