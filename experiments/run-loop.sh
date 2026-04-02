#!/bin/bash
#
# Research loop for autonomous compaction strategy research.
#
# Uses a persona-based approach: professor (reviews, directs) and student
# (executes experiments). Each iteration runs one persona, which chooses
# who to hand off to next.
#
# Usage: ./experiments/run-loop.sh [-v] [-s professor|student] [max_iterations]
#
# Default mode: quiet terminal with per-iteration summary display.
# Full stream-json output is always captured to session files for debugging.
#
# Examples:
#   ./experiments/run-loop.sh              # 20 iterations, start as professor
#   ./experiments/run-loop.sh 5            # 5 iterations
#   ./experiments/run-loop.sh -v 5         # also stream raw output to terminal
#   ./experiments/run-loop.sh -s student 5 # start as student
#
# Control:
#   touch experiments/PAUSE    # stop after current iteration finishes
#   rm experiments/PAUSE       # allow loop to continue
#

VERBOSE=false
PERSONA="professor"
SHARED_CONTEXT="experiments/SHARED_CONTEXT.md"

while [[ "$1" == -* ]]; do
  case "$1" in
    -v) VERBOSE=true; shift ;;
    -s) PERSONA="$2"; shift 2 ;;
    *)  echo "Unknown flag: $1"; exit 1 ;;
  esac
done

MAX_ITERATIONS=${1:-20}
iteration=0

# Validate persona
if [[ "$PERSONA" != "professor" && "$PERSONA" != "student" ]]; then
  echo "Invalid persona: $PERSONA (must be 'professor' or 'student')"
  exit 1
fi

# Check shared context exists
if [ ! -f "$SHARED_CONTEXT" ]; then
  echo "Shared context not found: $SHARED_CONTEXT"
  exit 1
fi

# --- Helper functions ---

# Build the full prompt by concatenating persona prompt + shared context
build_prompt() {
  local persona="$1"
  local prompt_file="experiments/${persona^^}_PROMPT.md"
  if [ ! -f "$prompt_file" ]; then
    # Try capitalised first letter (Professor, Student)
    prompt_file="experiments/$(echo "$persona" | sed 's/./\U&/')_PROMPT.md"
  fi
  # Map to actual filenames
  if [ "$persona" = "professor" ]; then
    prompt_file="experiments/PROFESSOR_PROMPT.md"
  else
    prompt_file="experiments/STUDENT_PROMPT.md"
  fi

  if [ ! -f "$prompt_file" ]; then
    echo "Prompt file not found: $prompt_file" >&2
    return 1
  fi

  cat "$prompt_file" "$SHARED_CONTEXT"
}

# Extracts the result text from a stream-json session file.
extract_result() {
  local session_file="$1"
  node -e "
const fs = require('fs');
const lines = fs.readFileSync(process.argv[1], 'utf-8').split('\n');
let resultText = '';
let lastAssistantText = '';
for (const line of lines) {
  if (!line.trim()) continue;
  try {
    const d = JSON.parse(line);
    if (d.type === 'result') resultText = d.result || '';
    else if (d.type === 'assistant') {
      for (const block of (d.message?.content || [])) {
        if (block.type === 'text') lastAssistantText = block.text;
      }
    }
  } catch {}
}
process.stdout.write(resultText || lastAssistantText);
" "$session_file"
}

# Extract the ## Iteration Summary block from result text (stdin).
extract_summary() {
  sed -n '/^## Iteration Summary$/,/^$/p' | head -10
}

# Extract the handoff signal from result text.
# Returns: professor, student, BLOCKED, or REVIEW
extract_handoff() {
  local result="$1"
  # Look for **Next:** line in the Handoff block
  local next=$(echo "$result" | grep -oP '\*\*Next:\*\*\s*\K\S+' | tail -1)
  echo "$next"
}

# Print cost/turns/duration from the result event.
extract_cost() {
  local session_file="$1"
  node -e "
const fs = require('fs');
const lines = fs.readFileSync(process.argv[1], 'utf-8').split('\n');
for (const line of lines) {
  try {
    const d = JSON.parse(line.trim());
    if (d.type === 'result') {
      const cost = d.total_cost_usd || 0;
      const turns = d.num_turns || '?';
      const duration = d.duration_ms || 0;
      console.log('  Cost: \$' + cost.toFixed(2) + ' | Turns: ' + turns + ' | Duration: ' + Math.floor(duration/1000) + 's');
      break;
    }
  } catch {}
}
" "$session_file"
}

# --- Main loop ---

echo "Starting research loop: $MAX_ITERATIONS iterations"
echo "Starting persona: $PERSONA"
echo "To pause: touch experiments/PAUSE"
echo ""

while [ $iteration -lt $MAX_ITERATIONS ]; do
  iteration=$((iteration + 1))
  echo "=== Iteration $iteration / $MAX_ITERATIONS [$PERSONA] ==="

  session_file="experiments/data/session-${iteration}.json"
  prompt=$(build_prompt "$PERSONA")

  if [ $? -ne 0 ]; then
    echo "Failed to build prompt for persona: $PERSONA"
    break
  fi

  if [ "$VERBOSE" = true ]; then
    echo "$prompt" | claude -p - \
      --model opus \
      --dangerously-skip-permissions \
      --max-turns 100 \
      --verbose \
      --output-format stream-json \
      | tee "$session_file"
  else
    echo "$prompt" | claude -p - \
      --model opus \
      --dangerously-skip-permissions \
      --max-turns 100 \
      --verbose \
      --output-format stream-json \
      > "$session_file"
  fi

  # Extract result text from session file
  result=$(extract_result "$session_file")

  echo ""
  echo "--- Iteration $iteration [$PERSONA] complete ---"

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

  # Extract handoff signal
  handoff=$(extract_handoff "$result")

  case "$handoff" in
    professor)
      echo "Handoff -> professor"
      PERSONA="professor"
      ;;
    student)
      echo "Handoff -> student"
      PERSONA="student"
      ;;
    BLOCKED)
      echo "Agent is blocked. Check issues labelled 'blocked: tim'."
      break
      ;;
    REVIEW)
      echo "Professor requests Tim's review before proceeding."
      break
      ;;
    *)
      # Fallback: check for legacy signals
      if echo "$result" | grep -q "BLOCKED"; then
        echo "Agent is blocked (legacy signal). Check issues labelled 'blocked: tim'."
        break
      elif echo "$result" | grep -q "RESEARCH_COMPLETE"; then
        echo "Research complete after $iteration iterations."
        break
      else
        echo "No handoff signal detected (got: '$handoff'). Stopping loop."
        break
      fi
      ;;
  esac

  # Check for pause signal
  if [ -f experiments/PAUSE ]; then
    echo "Pause signal detected. Remove experiments/PAUSE to continue."
    break
  fi
done

echo "Research loop finished after $iteration iterations."
