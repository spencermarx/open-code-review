# OCR Review Workflow

Complete 8-phase process for multi-agent code review.

> ⚠️ **CRITICAL**: You MUST update `state.json` **BEFORE starting work** on each phase. The `ocr progress` CLI reads this file for real-time tracking. Update the `current_phase` and `phase_number` immediately when transitioning—do not wait until the phase is complete.

---

## Phase 0: Session State Verification (ALWAYS DO FIRST)

Before starting ANY work, verify the current session state to avoid duplicating work or losing progress.

### Step 1: Check for existing session

```bash
# Get current branch and sanitize for filesystem (replace / with -)
BRANCH_RAW=$(git branch --show-current)
BRANCH=$(echo "$BRANCH_RAW" | tr '/' '-')
DATE=$(date +%Y-%m-%d)
SESSION_DIR=".ocr/sessions/${DATE}-${BRANCH}"

# Check if session exists
ls -la "$SESSION_DIR" 2>/dev/null
```

### Step 2: If `--fresh` flag provided

Delete the existing session and start from scratch:
```bash
rm -rf "$SESSION_DIR"
mkdir -p "$SESSION_DIR/rounds/round-1/reviews"
```
Then proceed to Phase 1.

### Step 3: If session exists, verify state matches files

Read `state.json` and verify actual files exist (see `references/session-files.md` for authoritative names):

| Phase Complete? | File check |
|-----------------|------------|
| context | `discovered-standards.md` exists |
| change-context | `context.md` exists |
| analysis | `context.md` has Tech Lead guidance section |
| reviews | ≥2 files in `rounds/round-{current_round}/reviews/` |
| discourse | `rounds/round-{current_round}/discourse.md` exists |
| synthesis | `rounds/round-{current_round}/final.md` exists |

> **Note**: Phase completion is derived from filesystem (file existence). The `current_phase` field in `state.json` indicates which phase is active, not what's complete.

### Step 3b: Round Resolution Algorithm

Determine which round to use:

```bash
ROUNDS_DIR="$SESSION_DIR/rounds"

# Count existing rounds
if [ ! -d "$ROUNDS_DIR" ]; then
  CURRENT_ROUND=1
  mkdir -p "$ROUNDS_DIR/round-1/reviews"
else
  # Find highest round number
  HIGHEST=$(ls -1 "$ROUNDS_DIR" | grep -E '^round-[0-9]+$' | sed 's/round-//' | sort -n | tail -1)
  HIGHEST=${HIGHEST:-0}
  
  # Check if highest round is complete (has final.md)
  if [ -f "$ROUNDS_DIR/round-$HIGHEST/final.md" ]; then
    # Start new round
    CURRENT_ROUND=$((HIGHEST + 1))
    mkdir -p "$ROUNDS_DIR/round-$CURRENT_ROUND/reviews"
  else
    # Resume existing round
    CURRENT_ROUND=$HIGHEST
  fi
fi
```

Update `state.json` with `current_round` value. **When starting a new round (CURRENT_ROUND > 1), also set `round_started_at` to the current timestamp** so the CLI progress timer shows elapsed time for the current round, not the entire session.

### Step 4: Determine resume point

- **state.json missing, files exist**: Recreate `state.json` based on file existence
- **state.json exists, files match**: Resume from `current_phase`
- **state.json and files mismatch**: Ask user which to trust
- **No session exists**: Create session directory and start Phase 1

### Step 5: Report to user

Before proceeding, tell the user:
```
📍 Session: {session_id}
📊 Current phase: {current_phase} (Phase {phase_number}/8)
🔄 Action: [Starting fresh | Resuming from Phase X]
```

---

## State Tracking

At **every phase transition**, update `.ocr/sessions/{id}/state.json`:

```json
{
  "session_id": "{id}",
  "status": "active",
  "current_phase": "reviews",
  "phase_number": 4,
  "current_round": 1,
  "started_at": "{PRESERVE_ORIGINAL}",
  "round_started_at": "{CURRENT_ISO_TIMESTAMP}",
  "updated_at": "{CURRENT_ISO_TIMESTAMP}"
}
```

**Minimal schema** — round metadata is derived from filesystem, not stored in state.json.

> ⚠️ **TIMESTAMP RULE**: Always use `run_command` tool to get timestamps. **Never construct them manually.**
> ```bash
> date -u +"%Y-%m-%dT%H:%M:%SZ"
> ```
> Use the **exact output** in state.json. Manual timestamps cause incorrect `ocr progress` display.

**CRITICAL**: Preserve `started_at` from session creation; set `round_started_at` when starting a new round (> 1); always update `updated_at` with current time.

**Status values**: `active` (in progress), `closed` (complete and dismissed)

**Phase values**: `context`, `change-context`, `analysis`, `reviews`, `aggregation`, `discourse`, `synthesis`, `complete`

## Artifact Checklist

> **See `references/session-files.md` for the authoritative file manifest.**

Before proceeding to each phase, verify the required artifacts exist:

| Phase | Required Before Starting | Artifact to Create |
|-------|-------------------------|-------------------|
| 1 | Session directory created | `state.json`, `discovered-standards.md`, `requirements.md` (if provided) |
| 2 | `discovered-standards.md` exists | `context.md`, `rounds/round-1/reviews/` directory, update `state.json` |
| 3 | `context.md` exists | Update `context.md` with Tech Lead guidance, update `state.json` |
| 4 | `context.md` exists | `rounds/round-{n}/reviews/{type}-{n}.md` for each reviewer, update `state.json` |
| 5 | ≥2 files in `rounds/round-{n}/reviews/` | Aggregated findings (inline), update `state.json` |
| 6 | Reviews complete | `rounds/round-{n}/discourse.md`, update `state.json` |
| 7 | `rounds/round-{n}/discourse.md` exists | `rounds/round-{n}/final.md`, update `state.json` |
| 8 | `rounds/round-{n}/final.md` exists | Present to user, set `status: "closed"` and `current_phase: "complete"` |

**NEVER skip directly to `final.md`** — this breaks progress tracking.

## Session Storage

**IMPORTANT**: Always store sessions in the project's `.ocr/sessions/` directory:

```bash
mkdir -p .ocr/sessions/{YYYY-MM-DD}-{branch}
```

This location is consistent regardless of how OCR is installed (CLI or plugin), enabling:
- `npx @open-code-review/cli progress` to track reviews in real-time
- `ocr history` and `ocr show` to access past sessions
- Cross-tool compatibility (same session visible from any AI tool)

## Phase 1: Context Discovery (Including Requirements)

**Goal**: Build review context from config + discovered files + user requirements.

### Steps

**1a. Load OCR Configuration**

Read `.ocr/config.yaml` for project-specific context and discovery settings:

```bash
cat .ocr/config.yaml
```

Extract:
- `context:` — Direct project context (injected into all reviews)
- `context_discovery.openspec` — OpenSpec integration settings
- `context_discovery.references` — Files to discover
- `rules:` — Per-severity review rules

**1b. Pull OpenSpec Context (if enabled)**

If `context_discovery.openspec.enabled: true`:

Read the `config` path from `.ocr/config.yaml` (defaults to `openspec/config.yaml`).
- For `.yaml` files: extract the `context` field
- For `.md` files: use entire content (legacy `openspec/project.md`)

```bash
# Read OpenSpec project context (path from .ocr/config.yaml openspec.config)
# Default: openspec/config.yaml, legacy: openspec/project.md
cat openspec/config.yaml 2>/dev/null || cat openspec/project.md 2>/dev/null

# Read merged specs for architectural context
find openspec/specs -name "*.md" -type f 2>/dev/null

# Check for active changes that affect the review
find openspec/changes -name "*.md" -type f 2>/dev/null
```

**1c. Discover Reference Files**

Read files listed in `context_discovery.references`:

```bash
# Check for AI assistant configuration
cat AGENTS.md 2>/dev/null
cat CLAUDE.md 2>/dev/null
cat .cursorrules 2>/dev/null
cat .windsurfrules 2>/dev/null

# Check for contribution guidelines
cat CONTRIBUTING.md 2>/dev/null

# Check for OpenSpec instructions (legacy projects)
cat openspec/AGENTS.md 2>/dev/null
```

**1d. Gather User-Provided Requirements**

Recognize requirements from ANY of these forms:
- **Inline**: "review this against the requirement that..."
- **Document reference**: "see the spec at path/to/spec.md" → Read the file
- **Pasted text**: Bug reports, acceptance criteria, notes
- **Ambiguous reference**: "check the auth spec" → Search for likely files or ask user

If requirements provided, save to `requirements.md` in session directory.

**1e. Merge Into discovered-standards.md**

```markdown
# Discovered Project Standards

## OCR Config Context
[content from .ocr/config.yaml context field]

## OpenSpec Context  
[content from openspec/config.yaml]

## From: AGENTS.md
[content]

## From: CLAUDE.md
[content]

## Review Rules
[rules from .ocr/config.yaml]
```

See `references/context-discovery.md` for detailed algorithm.

### ✅ Phase 1 Checkpoint

**STOP and verify before proceeding:**
- [ ] `discovered-standards.md` written to session directory
- [ ] If user provided requirements: `requirements.md` written

---

## Phase 2: Gather Change Context

**Goal**: Understand what changed and why.

### Steps

1. Identify the review target:
   - Staged changes: `git diff --cached`
   - Unstaged changes: `git diff`
   - Commit range: `git diff {range}`
   - PR: `gh pr diff {number}`

2. Gather supporting context:
   ```bash
   # Get the diff
   git diff --cached > /tmp/ocr-diff.txt
   
   # Get recent commit messages for intent
   git log --oneline -10
   
   # Get branch name
   git branch --show-current
   
   # List affected files
   git diff --cached --name-only
   ```

3. Create session directory:
   ```bash
   SESSION_ID="$(date +%Y-%m-%d)-$(git branch --show-current | tr '/' '-')"
   mkdir -p .ocr/sessions/$SESSION_ID/rounds/round-1/reviews
   ```

4. Save context to `context.md`:
   ```markdown
   # Review Context
   
   **Session**: {SESSION_ID}
   **Target**: staged changes
   **Branch**: {branch}
   **Files**: {count} files changed
   
   ## Change Summary
   [Brief description of what changed]
   
   ## Affected Files
   - path/to/file1.ts
   - path/to/file2.ts
   ```

### ✅ Phase 2 Checkpoint

**STOP and verify before proceeding:**
- [ ] Session directory created: `.ocr/sessions/{id}/`
- [ ] `rounds/round-1/reviews/` subdirectory created
- [ ] `context.md` written with change summary

---

## Phase 3: Tech Lead Analysis

**Goal**: Summarize changes, analyze against requirements, identify risks, select reviewers.

### Steps

1. **Check for existing map reference** (optional):
   
   If user explicitly references an existing map (e.g., "I've already generated a map", "use the map I created", "check the map in this session"):
   
   ```bash
   # Check for existing map artifacts
   ls .ocr/sessions/{id}/map/runs/*/map.md 2>/dev/null
   ```
   
   - **If found AND user referenced it**: Read the latest `map.md` as supplementary context
   - **If not found**: Inform user no map exists, proceed with standard review
   - **If user did NOT reference a map**: Do NOT automatically use map artifacts
   
   > **Note**: Maps are orthogonal tools. Only use if explicitly referenced by user.

2. Review requirements (if provided):
   - What is the code SUPPOSED to do?
   - What are the acceptance criteria?
   - What edge cases are implied?

3. Analyze the diff to understand:
   - What functionality is being added/changed/removed?
   - Does this align with requirements?
   - What is the likely intent?
   - What are the potential risk areas?

4. Create dynamic guidance for reviewers:
   ```markdown
   ## Tech Lead Guidance
   
   ### Requirements Summary (if provided)
   The changes should implement OAuth2 authentication per spec...
   Key acceptance criteria:
   - Users can log in via Google OAuth
   - Session tokens expire after 24 hours
   - Failed logins are rate-limited
   
   ### Change Summary
   This PR adds user authentication via OAuth2...
   
   ### Requirements Assessment
   - OAuth login: Implemented ✓
   - Token expiry: Not visible in diff - verify implementation
   - Rate limiting: Not found - may be missing
   
   ### Clarifying Questions (Tech Lead)
   - The spec says "fast response" - what's the target latency?
   - Should this include account lockout after N failures?
   
   ### Risk Areas
   - **Security**: New auth flow needs careful review
   - **Architecture**: New service layer pattern
   
   ### Focus Points
   - Validate token handling
   - Check for proper error handling
   - Ensure tests cover edge cases
   - Verify rate limiting is implemented
   ```

4. **Read reviewer team from config** (REQUIRED):

   ```bash
   # MUST read default_team from .ocr/config.yaml - do NOT use hardcoded values
   cat .ocr/config.yaml | grep -A10 'default_team:'
   ```
   
   Parse the `default_team` section to determine reviewer counts:
   ```yaml
   # Example config - actual values come from .ocr/config.yaml
   default_team:
     principal: 2    # Spawn principal-1, principal-2
     quality: 2      # Spawn quality-1, quality-2
     # security: 1   # Commented = not spawned by default
     testing: 1      # Spawn testing-1
   ```
   
   **Reviewer spawning rules**:
   - For each uncommented entry in `default_team`, spawn N instances
   - `principal: 2` → spawn `principal-1`, `principal-2`
   - `quality: 2` → spawn `quality-1`, `quality-2`  
   - `testing: 1` → spawn `testing-1`
   - Commented entries (e.g., `# security: 1`) are NOT spawned unless auto-detected
   
   **Auto-detection** (adds reviewers beyond config):
   | Change Type | Additional Reviewers |
   |-------------|---------------------|
   | Auth/Security changes | + 1× Security |
   | API changes | + 1× Security |
   | Logic changes | + 1× Testing (if not in config) |
   | User says "add security" | + 1× Security |

---

## Phase 4: Spawn Reviewers

**Goal**: Run each reviewer independently with configured redundancy.

> **⚠️ CRITICAL**: Reviewer counts and types come from `.ocr/config.yaml` `default_team` section.
> Do NOT use hardcoded defaults. Do NOT skip the `-{n}` suffix in filenames.
> See `references/session-files.md` for authoritative file naming.

### Steps

1. Load reviewer personas from `references/reviewers/`.

2. **Parse `default_team` from config** (already read in Phase 3):
   
   For each reviewer type in config, spawn the specified number of instances:
   
   ```bash
   # Example: If config says principal: 2, quality: 2, testing: 1
   # You MUST spawn exactly these reviewers with numbered suffixes:
   
   # From default_team.principal: 2
   → Create: rounds/round-$CURRENT_ROUND/reviews/principal-1.md
   → Create: rounds/round-$CURRENT_ROUND/reviews/principal-2.md
   
   # From default_team.quality: 2  
   → Create: rounds/round-$CURRENT_ROUND/reviews/quality-1.md
   → Create: rounds/round-$CURRENT_ROUND/reviews/quality-2.md
   
   # From default_team.testing: 1
   → Create: rounds/round-$CURRENT_ROUND/reviews/testing-1.md
   
   # Auto-detected (if applicable)
   → Create: rounds/round-$CURRENT_ROUND/reviews/security-1.md
   ```
   
   **File naming pattern**: `{type}-{n}.md` where n starts at 1.
   
   Examples: `principal-1.md`, `principal-2.md`, `quality-1.md`, `quality-2.md`, `testing-1.md`

3. Each task receives:
   - Reviewer persona (from `references/reviewers/{name}.md`)
   - Project context (from `discovered-standards.md`)
   - **Requirements context (from `requirements.md` if provided)**
   - Tech Lead guidance (including requirements assessment)
   - The diff to review
   - **Instruction to explore codebase with full agency**

4. Save each review to `.ocr/sessions/{id}/rounds/round-{current_round}/reviews/{type}-{n}.md`.

See `references/reviewer-task.md` for the task template.

### ✅ Phase 4 Checkpoint — MANDATORY VALIDATION

**Run this validation command before proceeding:**

```bash
# Set these based on your current session
SESSION_DIR=".ocr/sessions/$(ls -1t .ocr/sessions/ | head -1)"
CURRENT_ROUND=$(ls -1d "$SESSION_DIR/rounds/round-"* 2>/dev/null | wc -l | tr -d ' ')
REVIEWS_DIR="$SESSION_DIR/rounds/round-$CURRENT_ROUND/reviews"

echo "Validating: $REVIEWS_DIR"
ls -la "$REVIEWS_DIR/"

# Verify all files match {type}-{n}.md pattern (principal, quality, security, testing)
for f in "$REVIEWS_DIR/"*.md; do
  if [[ "$(basename "$f")" =~ ^(principal|quality|security|testing)-[0-9]+\.md$ ]]; then
    echo "✓ $(basename "$f")"
  else
    echo "❌ $(basename "$f") does not match {type}-{n}.md pattern"
    exit 1
  fi
done

REVIEWER_COUNT=$(ls -1 "$REVIEWS_DIR/"*.md 2>/dev/null | wc -l | tr -d ' ')
echo "✓ Found $REVIEWER_COUNT reviewer files"
```

**STOP and verify before proceeding:**
- [ ] Review files exist for EACH entry in `default_team` config
- [ ] File count matches sum of all `default_team` values
- [ ] All files use `{type}-{n}.md` pattern
- [ ] Each review file contains findings

---

## Phase 5: Aggregate Findings

**Goal**: Merge redundant reviewer runs and mark confidence.

### Steps

1. For reviewers with redundancy > 1, compare findings:
   - **Confirmed**: Found in all runs → Very High Confidence
   - **Partial**: Found in some runs → Medium Confidence
   - **Single**: Found in one run → Lower Confidence

2. Deduplicate identical findings.

3. Create aggregated findings per reviewer:
   ```markdown
   ## Security Reviewer (2 runs)
   
   ### Confirmed Findings (2/2 runs)
   - SQL injection risk in query builder [VERY HIGH]
   
   ### Partial Findings (1/2 runs)
   - Potential timing attack in comparison [MEDIUM]
   ```

---

## Phase 6: Discourse

**Goal**: Let reviewers challenge and build on each other's findings.

> Skip this phase if `--quick` flag is used.

### Steps

1. Present all aggregated findings to each reviewer.

2. Each reviewer responds using these types:
   - **AGREE**: "I concur with Security's SQL injection finding..."
   - **CHALLENGE**: "I disagree because the ORM sanitizes..."
   - **CONNECT**: "This relates to my maintainability concern..."
   - **SURFACE**: "Based on this discussion, I notice..."

3. Save discourse to `.ocr/sessions/{id}/rounds/round-{current_round}/discourse.md`.

See `references/discourse.md` for detailed instructions.

### ✅ Phase 6 Checkpoint

**STOP and verify before proceeding:**
- [ ] `rounds/round-{n}/discourse.md` written to round directory
- [ ] Contains AGREE/CHALLENGE/CONNECT/SURFACE responses
- [ ] (Or if `--quick` flag: skip this phase, proceed to synthesis)

---

## Phase 7: Synthesis

**Goal**: Produce final prioritized review and save to **`final.md`**.

> **File**: `rounds/round-{n}/final.md`
> **Template**: See `references/final-template.md` for format
> **Manifest**: See `references/session-files.md` for authoritative file names

### Steps

1. Aggregate all findings from Phase 5 and Phase 6.

2. Deduplicate and merge related findings.

3. Weight by confidence:
   - Confirmed by redundancy: +2
   - Agreed in discourse: +1
   - Challenged and defended: +1
   - Challenged and undefended: -1

4. Categorize findings:
   - **Must Fix**: Critical issues, security vulnerabilities
   - **Should Fix**: Important improvements
   - **Consider**: Nice-to-haves, style suggestions
   - **What's Working Well**: Positive feedback

5. **If requirements were provided**, include Requirements Assessment:
   - Which requirements are fully met?
   - Which requirements have gaps?
   - Any deviations from requirements?
   - Confidence level in requirements fulfillment

6. **Collect and surface Clarifying Questions** from Tech Lead and all reviewers:
   - Questions about requirements ambiguity
   - Questions about scope boundaries
   - Questions about edge cases
   - Questions about intentional exclusions
   
   These go in a prominent "Clarifying Questions" section for stakeholder response.

7. **Write the final review file**:
   ```bash
   # OUTPUT FILE - must be exactly this path:
   FINAL_FILE="$SESSION_DIR/rounds/round-$CURRENT_ROUND/final.md"
   ```
   
   Save synthesized review to `$FINAL_FILE`.

See `references/final-template.md` for the template format.

### ✅ Phase 7 Checkpoint — MANDATORY VALIDATION

**Run this validation command before proceeding:**

```bash
# Set these based on your current session
SESSION_DIR=".ocr/sessions/$(ls -1t .ocr/sessions/ | head -1)"
CURRENT_ROUND=$(ls -1d "$SESSION_DIR/rounds/round-"* 2>/dev/null | wc -l | tr -d ' ')
FINAL_FILE="$SESSION_DIR/rounds/round-$CURRENT_ROUND/final.md"

# Check file exists
if [ -f "$FINAL_FILE" ]; then
  echo "✓ final.md exists at $FINAL_FILE"
else
  echo "❌ final.md not found at $FINAL_FILE"
  exit 1
fi

# Check required content
if grep -q '## Verdict' "$FINAL_FILE"; then
  echo "✓ Contains Verdict section"
else
  echo "❌ Missing '## Verdict' section"
  exit 1
fi
```

**STOP and verify before proceeding:**
- [ ] `rounds/round-{n}/final.md` exists
- [ ] Contains prioritized findings (Must Fix, Should Fix, Consider)
- [ ] Contains Clarifying Questions section (if any)
- [ ] If requirements provided: Contains Requirements Assessment

---

## Phase 8: Present

**Goal**: Display results, optionally post to GitHub, and close the session.

### Steps

1. Display the final review in a clear format:
   ```markdown
   # Code Review: {branch}
   
   ## Summary
   {X} must-fix, {Y} should-fix, {Z} suggestions
   
   ## Must Fix
   ...
   
   ## Should Fix
   ...
   ```

2. If `--post` flag or PR target:
   - Check for `gh` CLI: `which gh`
   - Post as PR comment: `gh pr comment {number} --body-file final.md`

3. **Close the session** by updating `state.json`:
   ```json
   {
     "session_id": "{id}",
     "status": "closed",
     "current_phase": "complete",
     "phase_number": 8,
     "current_round": 1,
     "updated_at": "{now}"
   }
   ```
   
   > **IMPORTANT**: Setting `status: "closed"` ensures:
   > - The `ocr progress` CLI stops showing this session
   > - The session won't be picked up for resume
   > - The session remains accessible via `/ocr-history` and `/ocr-show`

4. Confirm session saved:
   ```
   ✓ Review complete
   → .ocr/sessions/{id}/rounds/round-{n}/final.md
   ```

---

## Quick Reference

| Phase | Command/Action | Output |
|-------|---------------|--------|
| 1 | Search for context files | `discovered-standards.md` |
| 2 | git diff, create session | `context.md`, `rounds/round-1/reviews/` |
| 3 | Analyze, select reviewers | guidance in `context.md` |
| 4 | Spawn reviewer tasks | `rounds/round-{n}/reviews/*.md` |
| 5 | Compare redundant runs | aggregated findings |
| 6 | Reviewer discourse | `rounds/round-{n}/discourse.md` |
| 7 | Synthesize and prioritize | `rounds/round-{n}/final.md` |
| 8 | Display/post | Terminal output, GitHub |
