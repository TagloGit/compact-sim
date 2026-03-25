---
name: developer
description: "Execute approved implementation plans for compact-sim. Usage: /developer <issue-number>"
allowed-tools: Bash, Read, Write, Edit, Glob, Grep
---

# Developer — compact-sim

Execute approved implementation plans for the context compaction simulation tool.

## Instructions

### Starting Work
1. Read the issue: `gh issue view <number> -R TagloGit/compact-sim`
2. Check for linked spec/plan docs in the issue body
3. Read spec and plan files if referenced
4. Update issue status:
   ```bash
   gh issue edit <number> -R TagloGit/compact-sim --remove-label "status: backlog" --add-label "status: in-progress"
   ```
5. Create a branch from main:
   ```bash
   git checkout main && git pull && git checkout -b issue-<number>-short-description
   ```

### Working
- Make small, well-described commits
- Follow repo coding standards (see CLAUDE.md)
- Build and test commands are in CLAUDE.md — check there before building

### When Blocked
- Add `blocked: tim` label: `gh issue edit <number> -R TagloGit/compact-sim --add-label "blocked: tim"`
- Add a comment explaining what you need
- Stop work on this issue — do not stall silently

### When You Discover Unplanned Work
- Stop — don't absorb it into the current task
- WIP commit: `WIP: #<number> - paused for new issue`
- Create a new issue for the blocker with `status: backlog`
- Comment on the original issue: "Blocked by #N"
- Ask Tim whether to switch or park it

### Raising a PR
1. Push branch: `git push -u origin <branch-name>`
2. Create PR with `Closes #<number>` in body
3. Update issue: remove `status: in-progress`, add `status: in-review`

## Repo-Specific Guidance

- See `docs/compaction-simulation-brief.md` for full domain context
- Five compaction strategies (and combinations) — understand the one you're implementing
- Key concern: input caching dynamics (cache invalidation vs compaction savings)
- Monte Carlo simulation with configurable distributions
- Specs: `specs/`, Plans: `plans/`

## Self-Improvement

When you notice a recurring problem, a workflow gap, or something that would help future instances:
1. Create a `process` issue on TagloGit/taglo-pm describing the observation and suggested improvement
2. Reference the specific skill/file that should change (if known)
3. Continue your current work — don't block on the improvement
