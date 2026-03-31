# 0003 — Agent-Driven Experimentation — Implementation Plan

## Overview

Two workstreams: (1) a CLI wrapper around the existing engine, and (2) the experiment harness files and loop script. The engine is already pure TypeScript — the CLI is a thin argument parser that calls existing functions and writes JSON output. The harness is mostly authored markdown/bash files.

Since the CLI will be run via `npx tsx`, we don't need a separate build step or tsconfig — tsx handles the `@/` path alias via tsconfig.json at runtime.

## Files to Touch

### New files — CLI

| File | Purpose |
|---|---|
| `src/cli/run.ts` | CLI entry point — arg parsing, dispatches to `sim`, `sweep`, `info` subcommands |

### New files — Experiment harness

| File | Purpose |
|---|---|
| `experiments/AGENT_PROMPT.md` | Persistent prompt for the Ralph loop agent |
| `experiments/RESEARCH_PLAN.md` | Initial research agenda with seeded questions |
| `experiments/EXPERIMENT_LOG.md` | Empty template for experiment index |
| `experiments/run-loop.sh` | Ralph loop bash script |
| `experiments/reference-conversations/README.md` | Placeholder with instructions for Tim to add conversation examples |
| `experiments/.gitkeep-journal` | Placeholder to create `journal/` dir in git |
| `experiments/.gitkeep-data` | Placeholder to create `data/` dir in git |

### Modified files

| File | Change |
|---|---|
| `package.json` | Add `cli:sim`, `cli:sweep`, `cli:info` npm scripts |
| `.gitignore` | Add `experiments/data/` (raw outputs are large, don't commit by default) |

## Order of Operations

### PR 1: CLI simulation runner

**Step 1 — Create `src/cli/run.ts`**

Single file, ~150 lines. Uses only Node.js builtins (`fs`, `process`) for arg parsing — no CLI framework needed for three subcommands.

Structure:
```
main()
  ├── parseArgs(process.argv)
  ├── if "sim"  → runSimCommand(configPath, outputPath)
  ├── if "sweep" → runSweepCommand(configPath, outputPath)
  └── if "info"  → runInfoCommand()
```

**`sim` subcommand:**
1. Read JSON file at `--config` path
2. Merge with `DEFAULT_CONFIG` (so partial configs work — agent only specifies what it wants to change)
3. Call `Effect.runSync(runSimulation(config))`
4. Write `SimulationResult` JSON to `--output` path (or stdout if omitted)

**`sweep` subcommand:**
1. Read JSON file at `--config` path as `SweepConfig`
2. Call `expandSweepConfig(config)` → `SimulationConfig[]`
3. Call `partitionByShape(configs)` → groups by conversation shape
4. For each group: `generateConversationSync(first config)` → reuse conversation for all configs in group
5. For each config: `runSimulationWithConversation(config, messages)` → `extractMetrics(config, messages)`
6. Collect all `SweepRunResult[]`, write JSON to `--output` path (or stdout)
7. Print progress to stderr (`N/M configs complete`) so it doesn't pollute stdout JSON

**`info` subcommand:**
1. Print all `StrategyType` values with brief descriptions
2. Print `PARAM_META` as formatted JSON (parameter names, groups, bounds, defaults)
3. Print `DEFAULT_CONFIG` as JSON

**Step 2 — Add npm scripts to `package.json`**

```json
"cli:sim": "tsx src/cli/run.ts sim",
"cli:sweep": "tsx src/cli/run.ts sweep",
"cli:info": "tsx src/cli/run.ts info"
```

So the agent can run `npm run cli:sim -- --config foo.json --output bar.json`.

**Step 3 — Add CLI tests**

`src/cli/__tests__/run.test.ts` — integration tests that:
- Run `sim` with a minimal config override, verify output has expected SimulationResult shape
- Run `sweep` with a small 2×2 sweep config, verify output is array of SweepRunResult
- Run `info`, verify it outputs valid JSON with strategy types and PARAM_META

These can call the command functions directly (imported) rather than spawning child processes — faster and simpler.

### PR 2: Experiment harness

**Step 4 — Create directory structure and .gitignore update**

- Create `experiments/journal/` and `experiments/data/` directories (with .gitkeep files)
- Create `experiments/reference-conversations/README.md` with instructions for Tim
- Add `experiments/data/` to `.gitignore` — raw simulation output is large and ephemeral. The agent commits journal entries and the experiment log but not bulk data.

**Step 5 — Write `experiments/AGENT_PROMPT.md`**

The core prompt that drives each loop iteration. Key sections:

1. **Identity & objective** — You are a research agent investigating compaction strategies. Your goal: maximise performance vs. cost for conversations exceeding 100k tokens.
2. **Available tools** — CLI commands (`npm run cli:sim`, `cli:sweep`, `cli:info`), Python for analysis, full file system access, git.
3. **Sub-agent usage** — Encourage heavy use of Claude Code's Agent tool for token-intensive or independent tasks: running large sweeps and summarising results, writing and executing Python analysis scripts, exploring side-questions. This keeps the main session focused on experiment design and high-level synthesis. The agent can also use sub-agents to parallelise independent work (e.g. run two sweeps simultaneously).
4. **Session workflow** — The 10-step workflow from the spec (read plan → pick experiment → run → analyse → write up → commit).
5. **File conventions** — Where to write journal entries, how to number experiments, how to update the log and plan.
6. **Quality bar** — Each journal entry should have: hypothesis, method (exact configs used), results (quantitative), analysis, conclusions, and next questions.
7. **Constraints** — Don't modify the engine code. Don't modify the web app. Focus on running experiments and writing findings.

**Step 6 — Write `experiments/RESEARCH_PLAN.md`**

Initial research agenda seeded with starting questions, structured as a prioritised checklist:

```markdown
# Research Plan

## Objective
Maximise performance vs. cost for Models Agent tasks exceeding 100k tokens total context.

## Phase 1: Baselines & orientation
- [ ] Run all 6 strategies with default config — establish baseline costs and behaviour
- [ ] Study reference conversations to derive realistic Models Agent config parameters
- [ ] Identify which config parameters have the most impact on cost (sensitivity analysis)

## Phase 2: Strategy comparison
- [ ] Compare strategies across conversation shapes (tool-heavy vs chat-heavy)
- [ ] Find crossover points — at what conversation length does each strategy win?
- [ ] Evaluate cache utilisation — which strategies preserve input caching best?

## Phase 3: Deep dives
- [ ] Incremental vs full compaction — when is the complexity worth it?
- [ ] Lossless strategies — cost of retrieval errors, sensitivity to retrieval probability
- [ ] Compression ratio impact — how much does summary quality matter?

## Phase 4: Recommendations
- [ ] Synthesise findings into actionable recommendation for Models Agent
- [ ] Identify the top 2-3 strategies worth prototyping in production

## Questions that emerge
(Agent adds new questions here as research progresses)
```

**Step 7 — Write `experiments/EXPERIMENT_LOG.md`**

Empty template:

```markdown
# Experiment Log

| # | Title | Date | Key finding |
|---|-------|------|-------------|
```

**Step 8 — Write `experiments/run-loop.sh`**

The Ralph loop script from the spec. Make it executable. Add a short usage comment at the top. Default model is Sonnet for cost efficiency — the agent can spawn Opus sub-agents when synthesis quality matters. Add `--model sonnet` to the `claude -p` invocation.

## Testing Approach

- **CLI:** Unit/integration tests in `src/cli/__tests__/run.test.ts` covering all three subcommands. Tests call the handler functions directly with test configs.
- **Harness:** No automated tests — the files are templates. Manual verification by running the loop for 1 iteration and confirming the agent produces output.
- **Smoke test:** After both PRs, run `experiments/run-loop.sh 1 2.00` (single iteration, $2 budget) to verify end-to-end flow.

## Notes

- **tsx vs compiled:** Using `npx tsx` means no compile step for the CLI. tsx resolves `@/` paths via tsconfig.json. This is fine for a tool that runs locally — it's not a production binary.
- **Partial configs:** The `sim` command merges input with `DEFAULT_CONFIG`, so the agent can specify only the parameters it cares about. This keeps experiment configs minimal and readable.
- **Sweep output size:** A large cartesian sweep can produce megabytes of JSON. Writing to file (not stdout) is the default recommendation in the agent prompt.
- **No strategy descriptions in code:** The engine doesn't currently have prose descriptions of strategies. The `info` command will include hardcoded descriptions — these are stable and well-understood from the spec.
