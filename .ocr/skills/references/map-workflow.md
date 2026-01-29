# OCR Map Workflow

Complete 6-phase process for generating a Code Review Map.

> ⚠️ **CRITICAL**: You MUST update `state.json` **BEFORE starting work** on each phase. Update the `current_phase` and `phase_number` immediately when transitioning.

---

## Overview

The Code Review Map is a **human-facing navigation tool** for large, complex changesets. It uses multi-agent orchestration to analyze changes and produce a structured document that helps humans:
- Understand the overall approach and intent
- Navigate changes in logical order
- Track review progress with checkboxes
- See how changes map to requirements (if provided)

**Primary audience**: Humans (the last line of defense on code changes)

**When to use**: Extremely large changesets that would take multiple hours for human review.

---

## Phase 0: Session State Verification

Before starting ANY work, verify the current session state.

### Step 1: Check for existing session

```bash
# Get current branch and sanitize for filesystem (replace / with -)
BRANCH_RAW=$(git branch --show-current)
BRANCH=$(echo "$BRANCH_RAW" | tr '/' '-')
DATE=$(date +%Y-%m-%d)
SESSION_DIR=".ocr/sessions/${DATE}-${BRANCH}"

ls -la "$SESSION_DIR" 2>/dev/null
```

### Step 2: If `--fresh` flag provided

Delete existing map artifacts and start fresh:
```bash
rm -rf "$SESSION_DIR/map"
mkdir -p "$SESSION_DIR/map/runs/run-1"
```

### Step 3: Map Run Resolution

Determine which map run to use (parallel to review rounds):

```bash
MAP_DIR="$SESSION_DIR/map/runs"

if [ ! -d "$MAP_DIR" ]; then
  CURRENT_RUN=1
  mkdir -p "$MAP_DIR/run-1"
else
  HIGHEST=$(ls -1 "$MAP_DIR" | grep -E '^run-[0-9]+$' | sed 's/run-//' | sort -n | tail -1)
  HIGHEST=${HIGHEST:-0}
  
  if [ -f "$MAP_DIR/run-$HIGHEST/map.md" ]; then
    CURRENT_RUN=$((HIGHEST + 1))
    mkdir -p "$MAP_DIR/run-$CURRENT_RUN"
  else
    CURRENT_RUN=$HIGHEST
  fi
fi
```

### Step 4: Initialize state.json for map workflow

**CRITICAL**: Before proceeding, you MUST update state.json to indicate a map workflow is starting.

> ⚠️ **TIMESTAMP RULE**: Always use `run_command` tool to get the current timestamp. **Never construct timestamps manually** — this causes incorrect elapsed time display in `ocr progress`.

**First, get the current timestamp** (run this command):
```bash
date -u +"%Y-%m-%dT%H:%M:%SZ"
```

Use the **exact output** (e.g., `2026-01-29T13:45:22Z`) in the state.json below.

```bash
STATE_FILE="$SESSION_DIR/state.json"
CURRENT_TIME="{OUTPUT_FROM_DATE_COMMAND}"  # Use actual output, not a placeholder

# Read existing state if present, or create new
if [ -f "$STATE_FILE" ]; then
  # Preserve started_at from existing session
  STARTED_AT=$(jq -r '.started_at // empty' "$STATE_FILE")
  STARTED_AT=${STARTED_AT:-$CURRENT_TIME}
else
  STARTED_AT=$CURRENT_TIME
fi

# Write updated state with map workflow fields
cat > "$STATE_FILE" << EOF
{
  "session_id": "{session_id}",
  "workflow_type": "map",
  "status": "active",
  "current_phase": "map-context",
  "phase_number": 1,
  "current_map_run": $CURRENT_RUN,
  "started_at": "$STARTED_AT",
  "map_started_at": "$CURRENT_TIME",
  "updated_at": "$CURRENT_TIME"
}
EOF
```

**Why `map_started_at` is required**: If this session previously had a review workflow, `started_at` will reflect when the review started, not the map. Setting `map_started_at` ensures `ocr progress` shows accurate elapsed time for the map workflow.

### Step 5: Report to user

```
📍 Session: {session_id}
🗺️ Map run: {current_run}
📊 Current phase: {current_phase}
🔄 Action: [Starting fresh | Resuming from Phase X]
```

---

## State Tracking

At **every phase transition**, update `.ocr/sessions/{id}/state.json`:

```json
{
  "session_id": "{id}",
  "workflow_type": "map",
  "status": "active",
  "current_phase": "flow-analysis",
  "phase_number": 3,
  "current_map_run": 1,
  "started_at": "{PRESERVE_ORIGINAL}",
  "map_started_at": "{SET_ONCE_ON_MAP_START}",
  "updated_at": "{CURRENT_ISO_TIMESTAMP}"
}
```

**CRITICAL**:
- Always include `"workflow_type": "map"` — this enables `ocr progress` to track map workflows.
- Set `"map_started_at"` ONCE when starting a new map run — this ensures accurate elapsed time tracking even if the session had a prior review workflow.

**Map phase values**: `map-context`, `topology`, `flow-analysis`, `requirements-mapping`, `synthesis`, `complete`

---

## Phase 1: Context Discovery (Shared with Review)

**Goal**: Build context from config + discovered files + user requirements.

This phase is **identical** to the review workflow's context discovery. See `references/context-discovery.md` for the complete algorithm.

### Steps

1. **Load OCR Configuration** — Read `.ocr/config.yaml`
2. **Pull OpenSpec Context** — If enabled, read specs and active changes
3. **Discover Reference Files** — AGENTS.md, CLAUDE.md, etc.
4. **Gather Requirements** — If user provided specs/proposals/tickets
5. **Merge Into discovered-standards.md**

### Map-Specific: Load Redundancy Config

Read `code-review-map` section from `.ocr/config.yaml`:

```yaml
code-review-map:
  agents:
    flow_analysts: 2         # Range: 1-10, default: 2
    requirements_mappers: 2  # Range: 1-10, default: 2
```

**Parsing Logic**:
1. Read `.ocr/config.yaml`
2. Extract `code-review-map.agents.flow_analysts` → store as `FLOW_ANALYST_COUNT`
3. Extract `code-review-map.agents.requirements_mappers` → store as `REQ_MAPPER_COUNT`
4. If section is missing or commented out, use defaults: `FLOW_ANALYST_COUNT=2`, `REQ_MAPPER_COUNT=2`
5. Clamp values to range 1-10

**Use these values** when spawning agents in Phase 3 and Phase 4.

### ✅ Phase 1 Checkpoint

- [ ] `discovered-standards.md` written (or reused from existing session)
- [ ] If requirements provided: `requirements.md` written
- [ ] Agent redundancy config loaded
- [ ] `state.json` updated: `current_phase: "map-context"`

---

## Phase 2: Topology Analysis (Map Architect)

**Goal**: Enumerate changed files and identify logical structure.

### Steps

1. **Get the changeset** (determine target from user request):

   | Target | Command |
   |--------|---------|
   | Staged changes (default) | `git diff --cached --name-only` |
   | Unstaged changes | `git diff --name-only` |
   | Specific commit | `git diff {commit}^ {commit} --name-only` |
   | Commit range | `git diff {from}..{to} --name-only` |
   | Branch vs main | `git diff main...{branch} --name-only` |
   | PR (via gh CLI) | `gh pr diff {number} --name-only` |

   ```bash
   # Default: staged changes
   git diff --cached --name-only
   
   # Store canonical file list for completeness validation
   git diff --cached --name-only > /tmp/ocr-canonical-files.txt
   ```
   
   **CRITICAL**: Store this canonical file list. It's used for completeness validation in Phase 5.

2. **Categorize each file**:
   - Entry points (routes, handlers, CLI, UI components)
   - Core logic (business logic, services, domain)
   - Infrastructure (config, utilities, shared)
   - Tests
   - Documentation

3. **Identify logical sections**:
   - Group by feature boundary
   - Group by architectural layer
   - Group by execution flow
   - Group by concern (security, performance)

4. **Determine review order** within sections:
   - Entry points first
   - Core implementations next
   - Supporting files
   - Tests last

5. **Save topology to session**:
   ```
   .ocr/sessions/{id}/map/runs/run-{n}/topology.md
   ```

### ✅ Phase 2 Checkpoint

- [ ] All changed files enumerated
- [ ] Files categorized by type
- [ ] Logical sections identified
- [ ] `topology.md` written
- [ ] `state.json` updated: `current_phase: "topology"`

---

## Phase 3: Flow Tracing (Flow Analysts)

**Goal**: Trace upstream/downstream dependencies for each changed file.

### Steps

1. **Spawn Flow Analysts** — spawn `FLOW_ANALYST_COUNT` agents (from config, default: 2)

2. **Assign files** to each analyst (can overlap for coverage)

3. **Each analyst traces**:
   - Upstream: What calls this code?
   - Downstream: What does this code call?
   - Related: Tests, config, siblings

4. **Collect findings** from all analysts

5. **Aggregate with redundancy validation**:
   - Findings from multiple analysts = high confidence
   - Unique findings = lower confidence but still valid

6. **Save flow analysis**:
   ```
   .ocr/sessions/{id}/map/runs/run-{n}/flow-analysis.md
   ```

### Spawning Flow Analysts

For each analyst, provide:
- Their persona (`references/map-personas/flow-analyst.md`)
- Discovered standards
- Assigned files to trace
- Instructions to explore freely

See `references/map-personas/flow-analyst.md` for persona details.

### ✅ Phase 3 Checkpoint

- [ ] Flow Analysts spawned (`FLOW_ANALYST_COUNT` from config)
- [ ] All changed files have flow context
- [ ] Findings aggregated
- [ ] `flow-analysis.md` written
- [ ] `state.json` updated: `current_phase: "flow-analysis"`

---

## Phase 4: Requirements Mapping (If Provided)

**Goal**: Map changes to requirements and identify coverage.

**Skip this phase** if no requirements were provided.

### Steps

1. **Spawn Requirements Mappers** — spawn `REQ_MAPPER_COUNT` agents (from config, default: 2)

2. **Provide context**:
   - Requirements from `requirements.md`
   - Changed files and their purposes (from topology)
   - Flow context (from Phase 3)

3. **Each mapper**:
   - Parses requirements into discrete items
   - Maps each change to relevant requirements
   - Identifies coverage status (full/partial/none)
   - Notes gaps and deviations

4. **Aggregate findings**:
   - Consistent mappings = high confidence
   - Divergent mappings = flag for human review

5. **Save requirements mapping**:
   ```
   .ocr/sessions/{id}/map/runs/run-{n}/requirements-mapping.md
   ```

### ✅ Phase 4 Checkpoint

- [ ] Requirements Mappers spawned (if requirements exist)
- [ ] Coverage matrix created
- [ ] Gaps identified
- [ ] `requirements-mapping.md` written
- [ ] `state.json` updated: `current_phase: "requirements-mapping"`

---

## Phase 5: Map Synthesis (Map Architect)

**Goal**: Combine all findings into the final Code Review Map optimized for reviewer workflow.

### Template Structure (in order)

1. **Executive Summary** — Context first
2. **Questions & Clarifications** — Ambiguities to resolve with author
3. **Requirements Coverage** — Coverage matrix (if requirements provided)
4. **Critical Review Focus** — High-value areas for human judgment
5. **Manual Verification** — Tests to run before/during review
6. **File Review** — Per-section file tracking (main tracking area)
7. **File Index** — Alphabetical reference
8. **Map Metadata** — Run info

### Steps

1. **Load all artifacts**:
   - `topology.md` — Section structure
   - `flow-analysis.md` — Dependency context
   - `requirements-mapping.md` — Coverage annotations (if exists)

2. **Construct Executive Summary**:
   - 1-2 paragraph narrative hypothesis
   - Key approaches observed
   - Frame as hypothesis, not assertion

3. **Gather Questions & Clarifications**:
   - Extract ambiguities from requirements mapping
   - List assumptions made during mapping
   - Include questions about deferred work or unclear intent

4. **Build Requirements Coverage** (if requirements provided):
   - Coverage matrix with status indicators
   - Note any gaps

5. **Generate Critical Review Focus**:
   - Identify areas where human judgment adds value
   - Focus on: business logic, security, edge cases, architectural decisions
   - Map each to requirement or concern
   - Do NOT perform code review — just flag areas for attention

6. **Generate Manual Verification**:
   - **Critical Path**: Happy-path tests from requirements
   - **Edge Cases & Error Handling**: From implementation analysis
   - **Non-Functional**: Performance, security checks
   - Omit only if changeset is purely docs/config

7. **Build File Review sections**:
   For each section from topology:
   - Narrative hypothesis (1-2 sentences)
   - File table with `Done` column (empty, reviewer marks `X`)
   - Flow summary
   - Requirements coverage
   - **Review Suggestions** (only if key things to watch for):
     - Specific areas mapped to requirements/concerns
     - Do NOT do code review — just flag for reviewer attention

8. **Create File Index**:
   - Alphabetical list of ALL changed files
   - Section reference for each

9. **Validate completeness**:
   ```bash
   EXPECTED=$(git diff --cached --name-only | wc -l)
   MAPPED=$(grep -oE '\| `[^`]+` \|' map.md | wc -l)
   [ "$EXPECTED" -ne "$MAPPED" ] && echo "ERROR: Missing files!"
   ```

10. **Save final map**:
    ```
    .ocr/sessions/{id}/map/runs/run-{n}/map.md
    ```

### Map Output Format

See `references/map-template.md` for the complete template.

### ✅ Phase 5 Checkpoint

- [ ] Executive Summary with hypothesis
- [ ] Questions & Clarifications populated
- [ ] Requirements Coverage matrix (if applicable)
- [ ] Critical Review Focus areas identified
- [ ] Manual Verification tests generated (or omitted if docs-only)
- [ ] All File Review sections with file tables
- [ ] Review Suggestions per section (only where key things to flag)
- [ ] File Index complete
- [ ] Completeness validated (all files appear in tables)
- [ ] `map.md` written
- [ ] `state.json` updated: `current_phase: "synthesis"`

---

## Phase 6: Present

**Goal**: Display the map to the user.

### Steps

1. **Read the final map**:
   ```bash
   cat .ocr/sessions/{id}/map/runs/run-{n}/map.md
   ```

2. **Present to user** with summary:
   ```
   🗺️ Code Review Map Generated
   
   📍 Session: {session_id}
   📁 Files mapped: {count}
   📑 Sections: {section_count}
   
   The map is saved at: .ocr/sessions/{id}/map/runs/run-{n}/map.md
   
   [Display map content]
   ```

3. **Update state**:
   ```json
   {
     "current_phase": "map-complete",
     "phase_number": 6
   }
   ```

### ✅ Phase 6 Checkpoint

- [ ] Map presented to user
- [ ] `state.json` updated: `current_phase: "complete"`

---

## Artifact Summary

| Phase | Artifact Created |
|-------|------------------|
| 1 | `discovered-standards.md`, `requirements.md` (if provided) |
| 2 | `map/runs/run-{n}/topology.md` |
| 3 | `map/runs/run-{n}/flow-analysis.md` |
| 4 | `map/runs/run-{n}/requirements-mapping.md` (if requirements) |
| 5 | `map/runs/run-{n}/map.md` |
| 6 | (presentation only) |

---

## Intermediate Artifact Templates

### topology.md Format

```markdown
# Topology Analysis

**Generated**: {timestamp}
**Files**: {count} changed files

## Canonical File List

```
{complete list from git diff --name-only}
```

## File Categorization

### Entry Points
| File | Type | Description |
|------|------|-------------|
| `api/auth.ts` | API Route | Authentication endpoints |
| `cli/index.ts` | CLI Command | Main CLI entry |

### Core Logic
| File | Type | Description |
|------|------|-------------|
| `services/auth.service.ts` | Service | Auth business logic |

### Infrastructure
| File | Type | Description |
|------|------|-------------|
| `utils/helpers.ts` | Utility | Shared helpers |

### Tests
| File | Coverage For |
|------|--------------|
| `tests/auth.test.ts` | `services/auth.service.ts` |

### Documentation
| File | Description |
|------|-------------|
| `README.md` | Project readme |

## Proposed Sections

### Section 1: {Name}
- **Purpose**: {what this section covers}
- **Files**: `file1.ts`, `file2.ts`, `file3.ts`
- **Entry Point**: `file1.ts`
- **Review Order**: file1 → file2 → file3

### Section 2: {Name}
...

## Unrelated Files

Files that don't fit into logical sections:
- `misc/cleanup.ts` — Opportunistic refactor, unrelated to main changes
```

### flow-analysis.md Format

```markdown
# Flow Analysis

**Generated**: {timestamp}
**Analysts**: {count} (redundancy: {n}x)

## Aggregated Findings

### File: `path/to/file1.ts`

**Confidence**: High (found by 2/2 analysts)

#### Upstream
| Caller | Location | Context |
|--------|----------|---------|
| `handleRequest()` | `api/routes.ts:42` | API entry point |

#### Downstream
| Callee | Location | Context |
|--------|----------|---------|
| `validateToken()` | `auth/validator.ts:15` | Token validation |

#### Related Files
- `tests/file1.test.ts` — Unit tests
- `config/auth.yaml` — Configuration

#### Section Assignment
**Proposed**: Section 1 (Authentication Flow)
**Rationale**: Entry point for auth, calls auth services

---

### File: `path/to/file2.ts`
...

## Cross-File Flows

### Flow 1: Authentication Request
```
api/auth.ts → services/auth.service.ts → utils/token.ts → db/users.ts
```

### Flow 2: ...

## Analyst Agreement

| File | Analyst 1 Section | Analyst 2 Section | Final |
|------|-------------------|-------------------|-------|
| `file1.ts` | Auth Flow | Auth Flow | Auth Flow ✓ |
| `file2.ts` | Auth Flow | API Layer | Auth Flow (majority) |
```

### requirements-mapping.md Format

```markdown
# Requirements Mapping

**Generated**: {timestamp}
**Mappers**: {count} (redundancy: {n}x)

## Requirements Parsed

| ID | Requirement | Source |
|----|-------------|--------|
| REQ-1 | User can log in via OAuth | spec.md:15 |
| REQ-2 | Sessions expire after 24h | spec.md:22 |
| REQ-3 | Failed logins are rate-limited | spec.md:28 |

## Coverage Matrix

| Requirement | Status | Files | Confidence |
|-------------|--------|-------|------------|
| REQ-1 | ✅ Full | `auth.ts`, `oauth.ts` | High (2/2) |
| REQ-2 | ⚠️ Partial | `session.ts` | Medium (1/2) |
| REQ-3 | ❌ None | — | High (2/2) |

## Per-Section Coverage

### Section 1: Authentication Flow
- REQ-1: ✅ Full
- REQ-2: ⚠️ Partial (missing cleanup)

### Section 2: API Endpoints
- REQ-3: ❌ Not addressed

## Gaps

### Unaddressed Requirements
- **REQ-3**: Rate limiting not found in changeset

### Partial Coverage Details
- **REQ-2**: Session creation exists, but no expiry logic found

## Mapper Agreement

| Requirement | Mapper 1 | Mapper 2 | Final |
|-------------|----------|----------|-------|
| REQ-1 | Full | Full | Full ✓ |
| REQ-2 | Partial | None | Partial (conservative) |
```

---

## Aggregation Logic

When multiple agents produce findings, aggregate as follows:

### Flow Analyst Aggregation

1. **Collect** all flow analyses from all analysts
2. **Group** by file path
3. **Merge** upstream/downstream findings:
   - Union of all unique callers/callees
   - If same relationship found by multiple analysts = **High confidence**
   - If found by only one analyst = **Medium confidence** (still include)
4. **Resolve** section assignments:
   - If all analysts agree → use that section
   - If disagreement → use majority, note dissent
   - If no majority → Map Architect decides

### Requirements Mapper Aggregation

1. **Collect** all mappings from all mappers
2. **Compare** coverage assessments per requirement:
   - If all agree → use that status
   - If disagree → use **most conservative** (None < Partial < Full)
   - Note disagreements for human review
3. **Merge** file-to-requirement mappings (union)
4. **Compile** unified gaps list

### Confidence Scoring

| Agreement | Confidence |
|-----------|------------|
| All agents agree | High |
| Majority agrees | Medium |
| No agreement | Low (flag for review) |

---

## Error Handling

### Incomplete Changeset

If `git diff` returns empty:
```
⚠️ No changes detected. Please stage changes or specify a target.
```

### Missing Config

If `.ocr/config.yaml` doesn't exist:
```
⚠️ OCR not configured. Run `ocr doctor` to check setup.
```

### Completeness Failure

If map doesn't include all files:
```
❌ Map incomplete: {missing_count} files not mapped.
Missing: [list files]

Re-running synthesis to include missing files...
```
