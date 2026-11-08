# Map Agent Task Templates

Templates for spawning map-specific agents (Flow Analysts, Requirements Mappers).

## Flow Analyst Task

When spawning a Flow Analyst, provide the following context:

```markdown
# Flow Analysis Task: Analyst {n}

## Your Persona

{content of references/map-personas/flow-analyst.md}

## Project Standards

{content of discovered-standards.md}

## Canonical File List

The following files are changed in this PR. You are responsible for tracing dependencies for the assigned subset.

```
{list of all changed files from git diff --name-only}
```

## Your Assigned Files

Trace dependencies for these files:

```
{subset of files assigned to this analyst}
```

## Map Architect Guidance

{brief context from topology analysis — what sections are emerging, what patterns are suspected}

## Your Task

For each assigned file, trace upstream and downstream dependencies:

### Output Format

For each file, produce:

```markdown
## Flow Analysis: {file_path}

### File Purpose
{1-2 sentence description of what this file does}

### Upstream (What calls this)
| Caller | Location | Context |
|--------|----------|---------|
| `functionName()` | `path/to/caller.ts:42` | {why it calls this} |

### Downstream (What this calls)
| Callee | Location | Context |
|--------|----------|---------|
| `otherFunction()` | `path/to/dep.ts:15` | {what it's used for} |

### Related Files
- `path/to/test.test.ts` — Test coverage
- `path/to/config.yaml` — Configuration dependency
- `path/to/sibling.ts` — Same module, similar pattern

### Suggested Section
{which logical section this file belongs to, e.g., "Authentication Flow"}

### Flow Context Summary
{1-2 sentence summary of where this code fits in the broader system}
```

### Agency Guidelines

You have **full agency** to explore the codebase:
- Read complete files to understand context
- Follow imports across package boundaries
- Use grep/search to find references
- Examine tests, configs, documentation
- Make professional judgments about relevance

### Quality Standards

- **Thorough**: Don't stop at first-level dependencies
- **Accurate**: Verify calls exist, don't assume
- **Documented**: Explain WHY each relationship matters
- **Bounded**: Stay relevant, don't trace the entire codebase
```

---

## Requirements Mapper Task

When spawning a Requirements Mapper, provide the following context:

```markdown
# Requirements Mapping Task: Mapper {n}

## Your Persona

{content of references/map-personas/requirements-mapper.md}

## Project Standards

{content of discovered-standards.md}

## Requirements Context

{content of requirements.md — the user-provided specs, proposals, tickets}

## Canonical File List

```
{list of all changed files}
```

## Topology Summary

{summary from topology analysis — what sections exist, what each contains}

## Flow Context

{summary from flow analysis — how files relate to each other}

## Your Task

Map each changed file to the requirements it addresses.

### Output Format

```markdown
# Requirements Mapping

## Requirements Identified

Parse the provided requirements into discrete items:

1. **REQ-1**: {requirement description}
2. **REQ-2**: {requirement description}
3. **REQ-3**: {requirement description}

## Coverage Matrix

| Requirement | Status | Implementing Files | Notes |
|-------------|--------|-------------------|-------|
| REQ-1 | ✅ Full | `file1.ts`, `file2.ts` | {how it's implemented} |
| REQ-2 | ⚠️ Partial | `file3.ts` | {what's missing} |
| REQ-3 | ❌ None | — | {why not covered} |

## Per-File Mapping

### `path/to/file1.ts`
- **Requirements Addressed**: REQ-1, REQ-4
- **Coverage**: Full
- **Notes**: {implementation details}

### `path/to/file2.ts`
- **Requirements Addressed**: REQ-2
- **Coverage**: Partial — missing error handling per spec line 42
- **Notes**: {what's implemented vs missing}

## Gaps and Concerns

### Unaddressed Requirements
- **REQ-3**: {description} — Not found in changeset. May be deferred or out of scope.

### Unclear Mappings
- `path/to/file5.ts` — Could address REQ-2 or REQ-4, unclear which

### Questions for Clarification
- Is REQ-3 intentionally excluded?
- The spec says "{ambiguous phrase}" — what does this mean?
```

### Quality Standards

- **Complete**: Map ALL provided requirements, even if not covered
- **Accurate**: Verify coverage claims by reading the code
- **Helpful**: Explain WHY coverage is full/partial/none
- **Honest**: Don't overclaim coverage; flag uncertainty
```

---

## Map Architect Coordination

The Map Architect (Tech Lead for map workflow) spawns agents as follows:

### Spawning Flow Analysts

```markdown
## Flow Analyst Spawning

1. Load config to get redundancy count:
   ```yaml
   code-review-map:
     agents:
       flow_analysts: 2  # Default
   ```

2. Divide files across analysts for coverage:
   - If 2 analysts: Each gets all files (full redundancy)
   - If 3+ analysts: Can split files with overlap

3. For each analyst, create task with:
   - Their persona
   - Discovered standards
   - Full canonical file list
   - Their assigned files
   - Current topology understanding

4. Collect all outputs before proceeding to aggregation
```

### Spawning Requirements Mappers

```markdown
## Requirements Mapper Spawning

**Skip if no requirements provided.**

1. Load config to get redundancy count:
   ```yaml
   code-review-map:
     agents:
       requirements_mappers: 2  # Default
   ```

2. For each mapper, create task with:
   - Their persona
   - Discovered standards
   - Requirements context
   - Full file list
   - Topology summary
   - Flow analysis summary

3. Collect all outputs before proceeding to aggregation
```

---

## Redundancy Handling

When running with redundancy > 1:

1. Each agent works **independently** (no knowledge of other agents)
2. Agents may produce overlapping or conflicting findings
3. After all agents complete, proceed to aggregation phase
4. See "Aggregation Logic" section in map-workflow.md for merging strategy
