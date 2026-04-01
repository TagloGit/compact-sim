#!/bin/bash
#
# Ralph loop for autonomous compaction strategy research.
#
# Usage: ./experiments/run-loop.sh [-v] [max_iterations]
#
# Examples:
#   ./experiments/run-loop.sh              # 20 iterations
#   ./experiments/run-loop.sh 5            # 5 iterations
#   ./experiments/run-loop.sh -v 5         # verbose — stream output to terminal
#
# Control:
#   touch experiments/PAUSE    # stop after current iteration finishes
#   rm experiments/PAUSE       # allow loop to continue
#

VERBOSE=false
if [ "$1" = "-v" ]; then
  VERBOSE=true
  shift
fi

MAX_ITERATIONS=${1:-20}
iteration=0

echo "Starting research loop: $MAX_ITERATIONS iterations"
echo "To pause: touch experiments/PAUSE"
echo ""

while [ $iteration -lt $MAX_ITERATIONS ]; do
  iteration=$((iteration + 1))
  echo "=== Iteration $iteration / $MAX_ITERATIONS ==="

  if [ "$VERBOSE" = true ]; then
    claude -p "$(cat experiments/AGENT_PROMPT.md)" \
      --model sonnet \
      --dangerously-skip-permissions \
      --max-turns 100 \
      --verbose \
      --output-format stream-json \
      | tee "experiments/data/session-${iteration}.json"
  else
    claude -p "$(cat experiments/AGENT_PROMPT.md)" \
      --model sonnet \
      --dangerously-skip-permissions \
      --max-turns 100 \
      --output-format json \
      > "experiments/data/session-${iteration}.json"
  fi

  echo "Iteration $iteration complete."

  # Check for pause signal
  if [ -f experiments/PAUSE ]; then
    echo "Pause signal detected. Remove experiments/PAUSE to continue."
    break
  fi
done

echo "Research loop finished after $iteration iterations."
