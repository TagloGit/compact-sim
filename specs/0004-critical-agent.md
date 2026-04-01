# 0004 — Critical Research Agent

## Problem

The experiment agent (ralph) currently treats the simulation engine as ground truth. It runs simulations, reports findings, and is explicitly forbidden from modifying engine code. This produces a blind spot: when the model produces surprising or unrealistic results, ralph has no way to investigate whether the model itself is flawed. It just reports the numbers.

A good researcher doesn't stop at "the model says X". They ask: *why* does the model say X? Is that intuitive? Or does it expose a modelling assumption that breaks down at the limits? Some configurations might produce attractive outputs on paper but look unrealistic when you dig into the mechanics — a signal that the model needs refinement, not that we've found the optimal strategy.

## Proposed Solution

Evolve ralph from a simulation consumer into a critical research agent that can:

1. **Interpret results critically** — when a configuration produces suspiciously good (or bad) results, investigate *why* before drawing conclusions. Ask: is this intuitive? Does the mechanism make sense? Or is this an artefact of a modelling simplification?

2. **Propose and ship engine improvements** — when ralph identifies a modelling gap, it can modify `src/engine/` and `src/cli/` directly. Changes go through well-organised PRs with clear rationale, but ralph does not need Tim's approval to merge them. Git history provides the safety net.

3. **Re-validate prior findings** — after making an engine change, ralph uses judgement to decide which earlier experiments might be affected and whether they need re-running. No mandatory regression suite, but the agent should note which prior findings might be invalidated.

4. **Traceability for engine changes** — all engine modifications are clearly tagged so they're easy to find in the history:
   - PRs that touch engine code get the `engine-change` label
   - Commits use an `[engine]` prefix in the message
   - PR descriptions include an `## Engine Change` section explaining what changed, why the model was inadequate, and what experiments motivated the change

## User Stories

- As Tim, I want ralph to reason about whether simulation results are realistic, so that I get actionable strategy recommendations rather than raw numbers.
- As Tim, I want ralph to improve the simulation model when it finds gaps, so that the research progresses without blocking on me for every engine tweak.
- As Tim, I want engine changes clearly tagged in the Git/PR history, so that I can review modelling changes separately from experiment work.
- As Tim, I want ralph to consider the impact of engine changes on prior findings, so that conclusions stay valid as the model evolves.

## Acceptance Criteria

- [ ] `AGENT_PROMPT.md` removes the "do not modify engine code" constraint
- [ ] `AGENT_PROMPT.md` adds guidance on critical interpretation of results (the "PhD student" posture)
- [ ] `AGENT_PROMPT.md` documents the engine-change PR/commit conventions (`engine-change` label, `[engine]` commit prefix, `## Engine Change` PR section)
- [ ] `AGENT_PROMPT.md` adds guidance on re-validating prior findings after engine changes (use judgement, note invalidated findings)
- [ ] `engine-change` label exists on the repo
- [ ] Agent prompt makes clear the simulation engine is a modelling tool, not ground truth

## Out of Scope

- Automated regression suite for engine changes (ralph uses judgement instead)
- Changes to the web UI or how the simulator tab works
- Changes to the run-loop harness (covered separately in #76)

## Open Questions

None — ready for review.
