---
name: qa
description: "Review test coverage against spec for compact-sim. Usage: /qa <pr-number-or-issue>"
allowed-tools: Bash, Read, Glob, Grep
---

# QA — compact-sim

Assess test coverage and quality for a PR or issue.

## Instructions

1. Parse the argument — PR number or issue number
2. Read the linked issue and find the spec (if one exists)
3. Read the PR diff: `gh pr diff <number> -R TagloGit/compact-sim`
4. Find test files related to the changed code
5. Assess:
   - Do tests exist for the new/changed code?
   - Do tests cover the spec's acceptance criteria?
   - Are edge cases tested (boundary values, degenerate inputs, empty distributions)?
   - Are tests well-written (clear names, good assertions)?

## Output Format

### QA Report: #N — [title]

**Spec Coverage:** [X of Y acceptance criteria have tests]
**Edge Cases:** [Covered / Gaps identified]
**Test Quality:** [observations]
**Gaps:**
- [specific gap]
**Recommendation:** [Pass / Needs more tests / Needs discussion]

## Repo-Specific Testing

- Key areas: simulation accuracy, cost calculation correctness, cache model behaviour, strategy composition
- Check that Monte Carlo distributions produce expected statistical properties
- Verify edge cases: zero-length conversations, 100% cache hit, 0% cache hit, max context window

## Behaviour Notes
- Do NOT write code or merge PRs
- Flag missing tests for error paths and boundary conditions

## Self-Improvement

When you notice a recurring problem or workflow gap:
1. Create a `process` issue on TagloGit/taglo-pm describing the observation
2. Continue your current work
