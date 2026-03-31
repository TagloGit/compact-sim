# 0003 — Agent-Driven Experimentation

## Problem

The compact-sim web app lets humans explore compaction strategies interactively, but drawing rigorous conclusions requires systematic experimentation — sweeping parameter spaces, comparing strategies under controlled conditions, and synthesising findings into actionable recommendations. This is tedious for a human but well-suited to an autonomous AI agent.

We want to enable a Claude Code agent to independently design experiments, run simulations, analyse results, and produce written recommendations for how to build real-world compaction in the Models Agent. The broad research objective is to maximise performance vs. cost for Models Agent tasks that exceed 100k tokens total context — that's where performance drops off notably.

## Proposed Solution

Two deliverables:

### 1. CLI simulation runner

A thin Node.js CLI entry point (`src/cli/run.ts`) that wraps the existing engine. The engine is already pure TypeScript with no browser dependencies — this just exposes it for command-line use.

**Commands:**

```bash
# Run a single simulation, output JSON result
npx tsx src/cli/run.ts sim --config config.json --output result.json

# Run a cartesian sweep, output all results
npx tsx src/cli/run.ts sweep --config sweep.json --output results.json

# Print strategy descriptions and parameter metadata
npx tsx src/cli/run.ts info
```

**Input/output format:** JSON files matching existing `SimulationConfig` / `SweepConfig` types for input, `SimulationResult` / `SweepRunResult[]` for output. The `info` command prints parameter metadata (from `PARAM_META`) and strategy descriptions to help the agent understand what it can configure.

### 2. Experiment harness (files + loop)

A Ralph-style autonomous loop where a Claude Code agent runs experiments across multiple sessions.

**File structure:**

```
experiments/
  AGENT_PROMPT.md          # Persistent prompt for the Ralph loop
  RESEARCH_PLAN.md         # Current research agenda — what to investigate next
  EXPERIMENT_LOG.md        # Index of all experiments and key findings
  run-loop.sh              # Ralph loop bash script
  reference-conversations/ # Real Models Agent conversation examples (JSON, seeded by Tim)
    README.md              # Notes on conversation characteristics
  journal/
    001-baseline.md        # Per-experiment write-ups (hypothesis, method, results, conclusions)
    002-cache-sensitivity.md
    ...
  data/
    001/                   # Raw simulation outputs per experiment
      sweep-results.json
      analysis.py          # Agent-written analysis scripts (optional)
      figures/             # Agent-generated charts (optional)
    002/
      ...
```

**Loop mechanism:**

A bash script (`experiments/run-loop.sh`) that invokes Claude Code non-interactively:

```bash
#!/bin/bash
MAX_ITERATIONS=${1:-20}
BUDGET_PER_ITERATION=${2:-5.00}
iteration=0

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
  
  # Check for pause signal
  if [ -f experiments/PAUSE ]; then
    echo "Pause signal detected. Remove experiments/PAUSE to continue."
    break
  fi
done
```

**Agent prompt (`AGENT_PROMPT.md`):**

A persistent prompt file that provides the agent with:

**Research objective:** Maximise performance vs. cost for Models Agent tasks that exceed 100k tokens total context. Performance degrades notably beyond this threshold — compaction strategies aim to keep context effective while controlling cost.

**Per-session workflow:**
1. Read `RESEARCH_PLAN.md` to understand the current research agenda
2. Read `EXPERIMENT_LOG.md` to see what's been done and learned so far
3. Decide what to focus on this session — pick the next experiment or continue an in-progress one
4. Design the experiment (hypothesis, configs, method)
5. Run simulations via the CLI
6. Analyse results (write Python scripts, generate charts — whatever helps)
7. Write up findings in `journal/NNN-title.md`
8. Update `EXPERIMENT_LOG.md` with a summary
9. Update `RESEARCH_PLAN.md` — cross off completed items, add new questions that emerged
10. Commit all work with a descriptive message

**Reference data:** The `reference-conversations/` directory contains real Models Agent conversation examples (seeded by Tim during setup). These vary widely as the agent's tools evolve, but serve as a realistic starting point. The agent should study these to calibrate simulation configs with realistic parameters.

**Control mechanisms:**
- `MAX_ITERATIONS` and `--max-budget-usd` as hard safety limits
- `experiments/PAUSE` file — touch it to stop the loop after the current iteration
- Tim reviews `EXPERIMENT_LOG.md` between runs and edits `RESEARCH_PLAN.md` to steer focus
- The agent can create GitHub Issues to track larger research threads

**Sub-agents:** The agent is encouraged to use Claude Code's Agent tool to delegate token-heavy or independent tasks — e.g. running large sweeps and summarising results, analysing datasets with Python, exploring side-questions that shouldn't consume the main session's context. This keeps the main conversation focused on high-level experiment design and synthesis. The loop runs on Sonnet by default for cost efficiency; the agent can escalate to Opus sub-agents for synthesis tasks where quality matters.

**Self-improvement:** The agent is free to modify `AGENT_PROMPT.md`, create helper scripts, or restructure the experiment files if it finds a better approach. The initial setup is a starting point, not a constraint.

## User Stories

- As Tim, I want to kick off an autonomous research loop and come back to a set of written findings about compaction strategy trade-offs, so I can make informed decisions about Models Agent compaction.
- As Tim, I want to review findings and steer the agent's next focus area by editing `RESEARCH_PLAN.md`, so the research stays relevant to my needs.
- As the agent, I want a CLI API to run simulations without a browser, so I can design and execute experiments programmatically.
- As the agent, I want a persistent experiment log and research plan, so I can pick up where I left off across sessions.

## Acceptance Criteria

- [ ] CLI runner can execute single simulations and sweeps from JSON config files
- [ ] CLI `info` command prints strategy types, parameter metadata, and default config
- [ ] `experiments/` directory structure is set up with AGENT_PROMPT.md, RESEARCH_PLAN.md, and EXPERIMENT_LOG.md templates
- [ ] `run-loop.sh` script implements the Ralph loop with configurable iteration limit and budget
- [ ] Loop respects PAUSE file for graceful stopping
- [ ] Agent prompt instructs the agent on the full experiment lifecycle (plan → run → analyse → write up → commit)
- [ ] Initial RESEARCH_PLAN.md seeds the agent with good starting questions

## Out of Scope

- MCP server integration (could add later if useful)
- Web UI changes — the existing web app is unchanged
- Real LLM integration — we're still running the simulation engine, not real models
- Multi-repo work — this is all within compact-sim

