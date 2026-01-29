# Change: Add Code Review Map Command

**Status**: approved

## Why

Large PRs and complex change sets are difficult for human reviewers to navigate efficiently. Without structure, reviewers jump around randomly, miss connections between related changes, and struggle to understand the overarching approach. High-performing engineering teams conduct code reviews by first understanding intent, finding an ideal starting point, and following logical flows—but this mental model isn't captured anywhere.

## What Changes

- **New `/ocr:map` command** — Multi-agent orchestration that analyzes a change set against requirements/specs and produces a structured Code Review Map
- **New `review-map` capability** — Spec defining the map generation workflow, agent personas, and output format
- **Map Architect agent** — New orchestrator role that analyzes change topology and determines optimal review ordering
- **Flow Analyst agents** — Specialized agents that trace upstream/downstream dependencies and group related changes
- **Review Map output format** — Rich markdown document with:
  - Executive summary of overarching approaches
  - Section-based, ordered change list with checkboxes for tracking
  - Flow-based groupings (entry points → implementations → tests)
  - Architectural/pattern annotations per section
- **Guaranteed completeness** — Tool-call validation ensures ALL changed files appear in the map
- **Session storage** — Map artifacts stored alongside review sessions
- **Orthogonal to review** — Map is a standalone human navigation tool; review command works independently and is sufficient for the vast majority of changesets
- **Natural language map reference** — Review workflow can accept references to existing maps as supplementary context when explicitly mentioned
- **Configurable redundancy** — `code-review-map` config section allows tuning agent redundancy for large codebases

## Impact

- **Affected specs**: `slash-commands` (new command), `session-management` (new artifacts), `context-discovery` (shared exhaustive workflow), `review-orchestration` (map reference support), `config` (new section), new `review-map` capability
- **Affected code**: `.ocr/skills/SKILL.md`, new `.ocr/commands/map.md`, new `.ocr/skills/references/map-workflow.md`
- **New files**: Map template, Map Architect persona, Flow Analyst persona
