# Shared Context — Research Loop

This file is included by both persona prompts. Do not run this file directly.

## Objective

Use the compact-sim simulation engine to draw conclusions about how to maximise performance and minimise cost for the **Models Agent**.

The Models Agent is an LLM agent that works via API tools with Tim's financial modelling software (Taglo Formula Boss). It reads and writes model structures, runs calculations, and manages complex multi-step modelling tasks. These conversations are tool-heavy, often exceeding 100k tokens total context — the point where performance degrades notably.

## Available Tools

### CLI commands

```bash
# Run a single simulation with a config file
npm run cli:sim -- --config <path>.json --output <path>.json

# Run a cartesian parameter sweep
npm run cli:sweep -- --config <path>.json --output <path>.json

# Print strategy descriptions, parameter metadata, and default config
npm run cli:info
```

**Partial configs work** — the `sim` command merges your config with `DEFAULT_CONFIG`, so you only need to specify the parameters you want to change.

Write config files to `experiments/data/NNN/` (where NNN is your experiment number). Write sweep output to files rather than stdout — large sweeps produce megabytes of JSON.

### Other tools

- **Python** — write and run analysis scripts for data processing, statistics, and chart generation
- **File system** — full read/write access for configs, results, scripts, and write-ups
- **Git** — commit your work, raise PRs
- **GitHub CLI** — manage issues, read issue context, create PRs
- **Sub-agents** — use Claude Code's Agent tool to delegate work (running sweeps, analysis scripts, exploring side-questions)

The loop runs on Sonnet by default for cost efficiency. You can spawn Opus sub-agents for synthesis tasks where quality matters.

## Coordination via GitHub Issues

Issues are the primary coordination mechanism between iterations. Each iteration is a fresh agent session — issues are how you understand what's been done and what needs doing.

### Reading state

```bash
# See all experiment issues
gh issue list -R TagloGit/compact-sim --label "experiment"

# See what's ready to pick up
gh issue list -R TagloGit/compact-sim --label "experiment" --label "status: backlog"

# See what's in progress (may need continuing)
gh issue list -R TagloGit/compact-sim --label "experiment" --label "status: in-progress"

# Read a specific issue for context
gh issue view <number> -R TagloGit/compact-sim
```

### Issue conventions

- **All research issues get the `experiment` label** — this distinguishes them from coding/repo issues
- **Parent issues** group related experiments into phases/epics
- **Child issues** are individual experiments or tasks, referencing the parent with "Part of #N"
- Use standard status labels: `status: backlog`, `status: in-progress`, `status: in-review`, `status: done`
- Update labels as you progress through work

### Branch and PR conventions

- **One PR per issue.** Each issue gets its own branch and PR.
- Branch naming: `experiment/NNN-short-title` (e.g. `experiment/003-cache-sensitivity`)
- PR description includes `Closes #N` to auto-close the issue on merge
- **Merge your own PRs** (squash merge to main) and set the issue label to `status: done`. Only leave a PR open if you need Tim's input — in that case, set the issue to `blocked: tim` and explain what you need in a comment.
- **Wait for CI before merging** — always check that CI checks have passed before merging a PR. Use `gh pr checks <number> -R TagloGit/compact-sim` to verify. Do not merge while checks are still running. CI runs the full test suite (`npm test`), lint, and build — so **you do not need to run tests locally** before pushing. CI will catch any issues. This saves time; focus your iteration on the actual work.

## Findings (`experiments/FINDINGS.md`)

This is the shared knowledge base across iterations. **Read it at the start of every iteration.** It contains calibration data, baseline costs, parameter sensitivities, cross-experiment conclusions, and known modelling limitations.

## Deliverables

### Journal entries (`experiments/journal/NNN-title.md`)

Number sequentially: `001-baseline.md`, `002-cache-sensitivity.md`, etc. Each entry must include:

- **Hypothesis** — what you expect to find and why
- **Method** — exact configs used (or reference to config files in `data/NNN/`)
- **Results** — quantitative findings (tables, key numbers)
- **Analysis** — what the results mean
- **Conclusions** — what you learned
- **Next questions** — what this experiment suggests investigating next

### Data directory (`experiments/data/NNN/`)

Create a subdirectory per experiment matching the journal number. Store configs, raw output, analysis scripts, and figures.

## Strategies Under Study

| Strategy | Approach |
|---|---|
| `full-compaction` | Replace all non-system messages with one summary at threshold |
| `incremental` | Compact new content in intervals, meta-compact accumulated summaries |
| `lossless-append` | Incremental + external store for originals |
| `lossless-hierarchical` | Full replacement each time, hierarchical external store levels |
| `lossless-tool-results` | Only tool_result messages go to external store |
| `lcm-subagent` | Full replacement + external store with dual retrieval tools |

Run `npm run cli:info` for full parameter metadata and defaults.

## Engine Changes

When you identify a modelling gap, you can modify the simulation engine directly (`src/engine/`, `src/cli/`).

- PRs that touch engine code get the `engine-change` label
- Commit prefix: `[engine]` (e.g. `[engine] Add cache warm-up delay`)
- PR description includes an `## Engine Change` section explaining what changed, why, and which experiments motivated it
- You may merge engine-change PRs without Tim's approval
- After engine changes, assess impact on prior findings and note any invalidated results in `FINDINGS.md`
- **Frontend required**: any new parameters or changed defaults MUST also be added to the web UI (`src/components/controls/ParameterPanel.tsx`, `src/components/explorer/SweepParameterPanel.tsx`, etc.) so Tim can use them in the browser. Do not merge engine PRs that add parameters without corresponding frontend support.

## Constraints

- Focus on experiments, analysis, findings, and engine improvements when needed
- **One task per iteration** — do not combine experiments with engine changes, or run experiments on different hypotheses, in the same iteration. One issue per iteration is a good rule of thumb.
