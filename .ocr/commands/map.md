---
description: Generate a Code Review Map to help navigate large, complex changesets.
name: "OCR: Map"
category: Code Review
tags: [ocr, map, navigation, review-map]
---

**Usage**
```
/ocr-map [target] [--fresh] [--requirements <path>]
```

**Arguments**
- `target` (optional): Branch, commit, or file to map. Defaults to staged changes.
- `--fresh` (optional): Clear any existing map for today's session and start from scratch.
- `--requirements <path>` (optional): Path to requirements document (spec, proposal, ticket).

**Examples**
```
/ocr-map                           # Map staged changes
/ocr-map --fresh                   # Clear existing map and regenerate
/ocr-map HEAD~5                    # Map last 5 commits
/ocr-map feature/big-refactor      # Map branch vs main
/ocr-map --requirements spec.md    # Map with requirements context
```

**When to Use**

The map command is for **extremely large changesets** that would take multiple hours for a human to review. It produces a structured navigation document with:
- Section-based grouping of related changes
- Checkboxes for tracking review progress
- Flow context (upstream/downstream dependencies)
- Requirements coverage (if requirements provided)

**For most changesets, `/ocr-review` is sufficient.** Use `/ocr-map` when you need a navigation aid for overwhelming changes.

---

## Steps

1. **Run Setup Guard** (MANDATORY - validates OCR is properly configured)
   - Read and execute `.ocr/skills/references/setup-guard.md`
   - If validation fails → STOP and show error
   - If validation passes → continue
2. **Session State Check** (verify existing session state)
3. Load the OCR skill from `.ocr/skills/SKILL.md`
4. Execute the 6-phase map workflow defined in `.ocr/skills/references/map-workflow.md`
5. Store results in `.ocr/sessions/{date}-{branch}/map/runs/run-{n}/`

---

## 🔍 Session State Check (Phase 0)

Before starting any map work, verify the current session state:

### Step 1: Check for existing session

```bash
# Find today's session directory
ls -la .ocr/sessions/$(date +%Y-%m-%d)-* 2>/dev/null
```

### Step 2: Check for existing map runs

```bash
# Find existing map runs
ls -la .ocr/sessions/{id}/map/runs/ 2>/dev/null
```

### Step 3: Determine action

- **If `--fresh` flag**: Delete the map directory and start from run-1
- **If map exists and complete**: Start new run (run-{n+1})
- **If map exists but incomplete**: Resume from current phase
- **If no map exists**: Start from run-1

---

## ⚠️ CRITICAL: Required Artifacts (Must Create In Order)

> **See `references/map-workflow.md` for the complete workflow.**

You MUST create these files sequentially:

```
.ocr/sessions/{YYYY-MM-DD}-{branch}/
├── state.json              # Session state (shared with review)
├── discovered-standards.md # Phase 1: merged project standards (shared)
├── requirements.md         # Phase 1: user requirements (if provided, shared)
└── map/
    └── runs/
        └── run-1/          # Map run (increments on re-map)
            ├── topology.md         # Phase 2: file categorization
            ├── flow-analysis.md    # Phase 3: dependency tracing
            ├── requirements-mapping.md  # Phase 4: coverage (if requirements)
            └── map.md              # Phase 5: final map output
```

### Checkpoint Rules

1. **Before Phase 2** (Topology): `discovered-standards.md` MUST exist
2. **Before Phase 3** (Flow Tracing): `topology.md` MUST exist
3. **Before Phase 4** (Requirements): `flow-analysis.md` MUST exist
4. **Before Phase 5** (Synthesis): All prior artifacts MUST exist
5. **NEVER** write `map.md` without completing Phases 1-4

---

## Configuration

The map workflow reads redundancy settings from `.ocr/config.yaml`:

```yaml
code-review-map:
  agents:
    flow_analysts: 2         # Default: 2 (range: 1-10)
    requirements_mappers: 2  # Default: 2 (range: 1-10)
```

If not configured, defaults are used.

---

## Output

The final `map.md` contains:
- **Executive Summary**: Narrative hypothesis about changeset intent
- **Sections**: Logical groupings with checkboxes for each file
- **Flow Context**: Upstream/downstream dependencies per section
- **Requirements Coverage**: Mapping to requirements (if provided)
- **File Index**: Alphabetical listing of all changed files

---

## Completeness Guarantee

The map MUST include every changed file. The workflow validates completeness before finalizing:

```bash
CHANGED=$(git diff --cached --name-only | wc -l)
MAPPED=$(grep -c '^\- \[ \]' map.md)

if [ "$CHANGED" -ne "$MAPPED" ]; then
  echo "ERROR: Map incomplete!"
fi
```

---

**Reference**
- See `.ocr/skills/SKILL.md` for Tech Lead context
- See `.ocr/skills/references/map-workflow.md` for detailed workflow phases
- See `.ocr/skills/references/map-template.md` for output format
- See `.ocr/skills/references/map-personas/` for agent personas
