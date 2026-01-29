# Design: Code Review Map

## Context

Human code reviewers struggle with large or complex PRs. They need:
1. Understanding of the "why" and overarching approach before diving into details
2. A logical starting point and path through the changes
3. Grouping of related changes so they can understand flows, not isolated files
4. A tracking mechanism to ensure complete coverage

The existing OCR review command produces quality-focused feedback but doesn't solve the navigation/organization problem. This proposal adds a complementary command that produces a "Review Map"—a structured guide for conducting the actual human review.

## Goals / Non-Goals

**Goals:**
- Help reviewers understand the big picture before line-by-line review
- Provide an optimal order for reviewing changes (entry points first, then implementation, then tests)
- Group related changes by logical flow (e.g., "Authentication Flow", "Database Migration")
- Guarantee 100% coverage—every changed file appears in the map
- Serve as a tracking document with checkboxes
- Integrate with existing session management

**Non-Goals:**
- Replacing the review command (map is complementary, not a substitute)
- Providing code quality feedback (that's the review command's job)
- Automated code review approval/rejection
- Real-time collaboration features

## Decisions

### Decision 1: Separate Command vs. Review Flag

**Decision**: New `/ocr:map` command rather than `--map` flag on review.

**Rationale**:
- Different user intent (navigation vs. feedback)
- Different output format and workflow
- Can be run independently or before/after review
- Cleaner mental model for users

**Alternatives considered**:
- `/ocr:review --map` — Rejected: conflates two distinct outputs
- Combined review+map output — Rejected: too long, different audiences

### Decision 2: Multi-Agent Architecture

**Decision**: Use orchestrated multi-agent flow similar to review, with specialized agents:

```
┌─────────────────────────────────────────────────────────────────┐
│                        Map Architect                             │
│  (Orchestrator: analyzes topology, determines section groupings) │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                       Flow Analysts (2x)                         │
│  (Trace dependencies, identify entry points, map relationships)  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                     Requirements Mapper (2x)                     │
│  (Maps changes to requirements/specs, annotates coverage)        │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                        Map Synthesis                             │
│  (Produces final ordered map with checkboxes and annotations)    │
└─────────────────────────────────────────────────────────────────┘
```

**Rationale**:
- Reuses proven multi-agent patterns from review command
- Redundancy in Flow Analysts (2x) increases confidence in dependency tracing
- Redundancy in Requirements Mapper (2x) increases confidence in requirements coverage
- Separation of concerns: topology vs. requirements vs. synthesis
- Leverages existing session infrastructure

### Decision 3: Completeness Guarantee via Tool Calls

**Decision**: Use explicit file enumeration and validation in the workflow.

**Implementation**:
1. Map Architect calls `git diff --name-only` to get canonical file list
2. This list is passed to all agents and tracked in session state
3. During synthesis, validate every file appears in at least one section
4. If files are missing, synthesis fails with clear error

**Rationale**:
- Tool calls are deterministic—no risk of LLM "forgetting" files
- Validation step catches errors before output
- Matches user requirement #4 and #7

### Decision 4: Review Map Output Format

**Decision**: Rich markdown with hierarchical sections, checkboxes, and annotations.

**Structure**:
```markdown
# Code Review Map: {branch}

## Overview
[Executive summary: what this PR achieves, key architectural decisions]

## How to Use This Map
[Brief instructions for reviewers]

## Sections

### 1. {Section Name} — {Purpose}

#### The Story (Hypothesis)
[Narrative explaining what we INFER these changes are trying to accomplish. Written as a PR author might explain them, but framed as a hypothesis for the reviewer to verify.]

**Assumptions**:
- [Explicit assumption 1 that this narrative is based on]
- [Explicit assumption 2 — e.g., "We assume X calls Y based on import analysis"]

**Key Patterns**: [architectural patterns used]
**Requirements**: [which specs/requirements this addresses]

#### Files
- [ ] `path/to/file1.ts` — [brief description of changes]
- [ ] `path/to/file2.ts` — [brief description of changes]

**Review Notes**: [what to look for, what to verify about our hypothesis]

---

### 2. {Section Name} — {Purpose}

#### The Story (Hypothesis)
[Continues the narrative, referencing what was established in Section 1 and setting up what comes next. Remember: this is our inference — the reviewer's job is to verify.]

**Assumptions**:
- [...]

...

---

## Unrelated Changes

> **Note**: The following changes do not appear to relate to the stated requirements, specifications, or the logical flow of changes above. They are listed separately to maintain the coherent narrative in the main sections. The reviewer should verify whether these are:
> - Legitimate but unrelated cleanup/refactoring
> - Accidentally included in the changeset
> - Actually related in ways we did not detect

- [ ] `path/to/unrelated-file.ts` — [description, why we believe it's unrelated]

## File Index
[Alphabetical list of all files with section cross-references]

## Reviewer Checklist
- [ ] All sections reviewed
- [ ] Understood overall approach
- [ ] Verified requirements coverage
```

**Rationale**:
- Matches how high-performing teams actually review code
- Checkboxes provide tracking (user requirement #5)
- Sections group related changes (user requirement #2)
- File Index provides completeness verification (user requirement #4)

### Decision 5: Session Storage

**Decision**: Store map artifacts in session directory alongside reviews.

**Structure**:
```
.ocr/sessions/{date}-{branch}/
├── state.json
├── discovered-standards.md
├── context.md
├── map/
│   ├── map.md           # Final review map
│   ├── topology.json    # File relationships (optional)
│   └── coverage.json    # Requirements coverage (optional)
└── rounds/round-{n}/
    └── ...
```

**Rationale**:
- Consistent with existing session management
- Map can be regenerated independently of reviews
- Supports future features (map + review together)

## Risks / Trade-offs

| Risk | Mitigation |
|------|------------|
| Large diffs may produce very long maps | Implement section collapsing, offer `--summary` mode |
| LLM may misidentify flow relationships | Redundant Flow Analysts + discourse-like validation |
| Slow for very large PRs | Phase 1 focuses on correctness; optimize later if needed |
| Users may expect review feedback in map | Clear documentation that map ≠ review |

## Resolved Decisions

### Decision 6: Shared Standards Discovery vs. Changeset Exploration

**Key Distinction**: Standards discovery and changeset exploration are separate concerns.

#### Standards Discovery (SHARED — identical for map and review)

**What**: Loading project standards, conventions, and high-level context from config files.

**Workflow** (from `.ocr/skills/references/context-discovery.md`):
1. Read `.ocr/config.yaml` for project-specific context and rules (Priority 1)
2. Pull OpenSpec context from `openspec/config.yaml` and all specs (Priority 2)
3. Discover reference files: AGENTS.md, CLAUDE.md, .cursorrules, etc. (Priority 3)
4. Load additional user-configured files (Priority 4)
5. Merge ALL context with source attribution — no skipping, no summarizing
6. Save to `discovered-standards.md` in session directory

**Requirements**:
- Discovery MUST be **thorough and exhaustive** — read complete file contents
- Both commands produce identical `discovered-standards.md` output
- If session already has discovered standards, reuse them (no re-discovery)
- Standards are loaded ONLY via this process using `config.yaml` priority chain

#### Changeset Exploration (MAP-SPECIFIC — multi-agent, multi-stage)

**What**: Deep investigation of the actual code changes and surrounding implementation.

**Stages**:
1. **Topology Analysis** — Map Architect enumerates files, identifies structure
2. **Flow Tracing** — Flow Analysts (with redundancy) trace upstream/downstream dependencies
3. **Requirements Mapping** — Map changes to requirements (if provided)
4. **Synthesis** — Combine findings into coherent map with sections

**Requirements**:
- Multi-agent with redundancy for confidence
- Deep exploration: callers, callees, tests, config, siblings
- Must understand where each change fits in the broader system
- Informs section grouping and narrative hypothesis generation

**Rationale**: Standards discovery is a lightweight, reusable process that provides context. Changeset exploration is a heavyweight, workflow-specific process that requires multiple specialized agents working across multiple stages.

### Decision 7: Flexible Requirements Input (No Flag)

**Decision**: Map command uses the same natural language requirements input as review—no explicit `--requirements` flag.

**How it works**: Users provide requirements context via:
- Inline description in the map request
- Reference to a document path (spec, proposal, ticket)
- Pasted text (acceptance criteria, notes)

The Map Architect interprets the intent and propagates requirements to relevant agents.

### Decision 8: Map Runs for Incremental Updates

**Decision**: Multiple map invocations on the same change set create new "runs" stored in `map/runs/run-{n}/`.

**Structure**:
```
.ocr/sessions/{id}/
├── state.json
├── discovered-standards.md    # Shared
├── context.md                  # Shared
├── map/
│   └── runs/
│       ├── run-1/
│       │   └── map.md
│       └── run-2/
│       │   └── map.md
└── rounds/                     # Review rounds
```

**Rationale**: 
- Matches existing `rounds/round-{n}/` pattern for reviews
- As PRs evolve, teams can generate fresh maps while preserving history
- Enables comparison between map versions if needed

### Decision 9: Map and Review as Orthogonal Tools

**Decision**: Keep `/ocr:map` and `/ocr:review` as separate, orthogonal tools. No `--map` flag on review.

**Rationale**:
- **Clear separation of concerns**: Map = human navigation tool, Review = AI-powered feedback
- **No false expectations**: Users don't wonder "should I use --map?" — the answer is almost always no
- **Primary audience clarity**: Map exists for humans, not to improve AI review quality
- **DX simplicity**: Two focused tools that do one thing well

**Composition**: Users who want both run both commands. The outputs complement each other for the human reviewer:
- Map helps human track progress and understand structure
- Review provides AI feedback on implementation quality

### Decision 10: Natural Language Map Reference in Review

**Decision**: The review workflow can accept natural language references to existing maps as supplementary context when explicitly mentioned by the user.

**Example phrases**:
- "I've already generated a map for this session"
- "Use the map I created"
- "Check the map in this session for context"

**Behavior**:
- Tech Lead checks for existing map artifacts in `map/` directory
- If found and referenced: Uses as supplementary background context
- Tech Lead still performs standard investigation independently
- Map does NOT change the review workflow — it's just additional reading material

**Key constraint**: Maps are NOT automatically used. User must explicitly reference them.

**Rationale**: This provides flexibility for edge cases without creating a dependency or false expectation that reviews need maps.

### Decision 11: Configurable Agent Redundancy

**Decision**: Add `code-review-map` configuration section with tunable redundancy parameters for the `/ocr:map` command.

**Config Schema**:
```yaml
code-review-map:
  agents:
    flow_analysts: 2           # Default: 2 (range: 1-10)
    requirements_mappers: 2    # Default: 2 (range: 1-10)
```

**Use Cases**:
- **Large codebases**: Increase to 3-4 for better coverage of complex dependency graphs
- **Speed priority**: Reduce to 1 for faster generation (no redundancy validation)
- **Default**: 2 provides good balance of accuracy and speed

**Rationale**: Different projects have different needs. Large monorepos benefit from higher redundancy, while small projects may prioritize speed.

### Decision 12: Map vs Review — Positioning and Use Cases

**Key Distinction**: The code review map is a **human-facing tool**. The review command is sufficient for the vast majority of cases.

#### Primary Audience: Humans

The map's **primary purpose** is to help humans navigate and understand extremely large, complex changesets:
- Exhaustive coverage of ALL changed files — humans are the last line of defense
- Section-based grouping with narrative hypotheses — tells a story of the change
- Checkbox tracking — enables systematic review progress
- Flow-based ordering — entry points → implementations → tests

**When to use `/ocr:map`**:
- Changeset is extremely large (would take multiple hours for human review)
- You need a navigation aid to track progress through many files
- You want to understand the structure before diving into details

#### Standard Review: Already Comprehensive

The `/ocr:review` command is **sufficient for the vast majority of changesets**:
- Tech Lead performs thorough initial changeset analysis
- Specialized reviewer sub-agents explore upstream/downstream implementation
- Multiple perspectives with redundancy and discourse
- Comprehensive feedback without map overhead

**Key insight**: Reviewers already do upstream/downstream investigation. The map uses *additional redundant specialized agents* to do similar work — this is valuable for humans navigating complex changes, but typically overkill for the AI review workflow.

#### When to Use Each

| Tool | When to Use |
|------|-------------|
| `/ocr:review` | Default. Sufficient for nearly all changesets. |
| `/ocr:map` | Extremely large changesets (multi-hour human review). Human navigation aid. |
| Both | Run map first for yourself, then review for AI feedback. Outputs complement each other. |

**Rationale**: Don't push users toward map when review alone is sufficient. Map is a specialized tool for edge cases where humans need help navigating overwhelming changesets.
