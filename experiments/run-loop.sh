#!/bin/bash
#
# Research loop for autonomous compaction strategy research.
#
# Usage: ./experiments/run-loop.sh [-v] [-p prompt_file] [max_iterations]
#
# Default mode: quiet terminal with per-iteration summary display.
# Full stream-json output is always captured to session files for debugging.
#
# Examples:
#   ./experiments/run-loop.sh              # 20 iterations, summary only
#   ./experiments/run-loop.sh 5            # 5 iterations, summary only
#   ./experiments/run-loop.sh -v 5         # also stream raw output to terminal
#   ./experiments/run-loop.sh -p experiments/TEST_PROMPT.md 3   # test harness with stub prompt
#
# Control:
#   touch experiments/PAUSE    # stop after current iteration finishes
#   rm experiments/PAUSE       # allow loop to continue
#

VERBOSE=false
PROMPT_FILE="experiments/AGENT_PROMPT.md"

while [[ "$1" == -* ]]; do
  case "$1" in
    -v) VERBOSE=true; shift ;;
    -p) PROMPT_FILE="$2"; shift 2 ;;
    *)  echo "Unknown flag: $1"; exit 1 ;;
  esac
done

if [ ! -f "$PROMPT_FILE" ]; then
  echo "Prompt file not found: $PROMPT_FILE"
  exit 1
fi

MAX_ITERATIONS=${1:-20}
iteration=0

# --- Helper functions ---

# Extracts the result text from a stream-json session file.
# Looks for the {"type":"result"} event; falls back to last assistant text block.
extract_result() {
  local session_file="$1"
  python -c "
import json, sys
result_text = ''
last_assistant_text = ''
with open(sys.argv[1], encoding='utf-8') as f:
    for line in f:
        line = line.strip()
        if not line:
            continue
        try:
            d = json.loads(line)
        except:
            continue
        if d.get('type') == 'result':
            result_text = d.get('result', '')
        elif d.get('type') == 'assistant':
            for block in d.get('message', {}).get('content', []):
                if block.get('type') == 'text':
                    last_assistant_text = block['text']
print(result_text or last_assistant_text)
" "$session_file"
}

# Extract the ## Iteration Summary block from result text (stdin).
extract_summary() {
  sed -n '/^## Iteration Summary$/,/^$/p' | head -10
}

# Print cost/turns/duration from the result event.
extract_cost() {
  local session_file="$1"
  python -c "
import json, sys
with open(sys.argv[1], encoding='utf-8') as f:
    for line in f:
        try:
            d = json.loads(line.strip())
        except:
            continue
        if d.get('type') == 'result':
            cost = d.get('total_cost_usd', 0)
            turns = d.get('num_turns', '?')
            duration = d.get('duration_ms', 0)
            print(f'  Cost: \${cost:.2f} | Turns: {turns} | Duration: {duration//1000}s')
            break
" "$session_file"
}

# --- Main loop ---

echo "Starting research loop: $MAX_ITERATIONS iterations"
echo "Prompt: $PROMPT_FILE"
echo "To pause: touch experiments/PAUSE"
echo ""

while [ $iteration -lt $MAX_ITERATIONS ]; do
  iteration=$((iteration + 1))
  echo "=== Iteration $iteration / $MAX_ITERATIONS ==="

  session_file="experiments/data/session-${iteration}.json"

  if [ "$VERBOSE" = true ]; then
    # Stream to terminal AND capture to file
    claude -p "$(cat "$PROMPT_FILE")" \
      --model sonnet \
      --dangerously-skip-permissions \
      --max-turns 100 \
      --verbose \
      --output-format stream-json \
      | tee "$session_file"
  else
    # Capture to file only (quiet terminal)
    claude -p "$(cat "$PROMPT_FILE")" \
      --model sonnet \
      --dangerously-skip-permissions \
      --max-turns 100 \
      --verbose \
      --output-format stream-json \
      > "$session_file"
  fi

  # Extract result text from session file
  result=$(extract_result "$session_file")

  echo ""
  echo "--- Iteration $iteration complete ---"

  # Show summary if the agent included one
  summary=$(echo "$result" | extract_summary)
  if [ -n "$summary" ]; then
    echo "$summary"
  else
    echo "(no summary block found — showing last 5 lines)"
    echo "$result" | tail -5
  fi

  extract_cost "$session_file"
  echo "--- Session: $session_file ---"
  echo ""

  # Check agent's exit signal
  if echo "$result" | grep -q "BLOCKED"; then
    echo "Agent is blocked. Check issues labelled 'blocked: tim'."
    break
  fi

  if echo "$result" | grep -q "RESEARCH_COMPLETE"; then
    echo "Research complete after $iteration iterations."
    break
  fi

  # Check for pause signal
  if [ -f experiments/PAUSE ]; then
    echo "Pause signal detected. Remove experiments/PAUSE to continue."
    break
  fi
done

echo "Research loop finished after $iteration iterations."
