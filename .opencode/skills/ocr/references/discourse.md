# Discourse Phase

After individual reviews are complete, facilitate a discourse phase where reviewers respond to each other's findings.

## Purpose

- **Challenge findings** — Push back on conclusions with reasoning
- **Build consensus** — Identify agreed-upon issues (higher confidence)
- **Connect insights** — Link findings across different reviewers
- **Surface new concerns** — Raise issues that emerge from discussion

## When to Run

- **Default**: Always run after individual reviews
- **Skip**: When `--quick` flag is specified

## Response Types

Reviewers use these fixed response types (not user-configurable):

| Type | Purpose | Effect |
|------|---------|--------|
| **AGREE** | Endorse another's finding | Increases confidence |
| **CHALLENGE** | Push back with reasoning | May reduce confidence or refine finding |
| **CONNECT** | Link findings across reviewers | Creates cross-cutting insight |
| **SURFACE** | Raise new concern from discussion | Adds new finding |

## Discourse Process

### Step 1: Compile Individual Reviews

Gather all individual review outputs from the current round (see `references/session-files.md` for naming convention):
```
rounds/round-{n}/reviews/principal-1.md
rounds/round-{n}/reviews/principal-2.md
rounds/round-{n}/reviews/quality-1.md
rounds/round-{n}/reviews/quality-2.md
rounds/round-{n}/reviews/security-1.md (if assigned)
rounds/round-{n}/reviews/testing-1.md (if assigned)
```

### Step 2: Present All Findings

Create a consolidated view of all findings for reviewers to respond to:

```markdown
## All Findings for Discourse

### From principal-1:
1. [Finding: Missing error handling in auth flow] - High
2. [Finding: Inconsistent naming in service layer] - Medium

### From principal-2:
1. [Finding: Missing error handling in auth flow] - High
2. [Finding: Potential memory leak in cache] - High

### From quality-1:
1. [Finding: Long function needs decomposition] - Medium
2. [Finding: Missing type annotations] - Low

...
```

### Step 3: Spawn Discourse Tasks

For each reviewer, spawn a discourse task:

```markdown
# Discourse Task: {reviewer}

You previously reviewed this code. Now review what OTHER reviewers found.

## Your Original Findings
{their findings}

## Other Reviewers' Findings
{all other findings}

## Your Task

Respond to other reviewers' findings using:
- **AGREE [reviewer] [finding]**: You concur with this finding
- **CHALLENGE [reviewer] [finding]**: You disagree, with reasoning
- **CONNECT [your finding] → [their finding]**: Link related findings
- **SURFACE**: Raise new concern that emerged from reading others' work

Be constructive. Challenge with reasoning, not dismissal.
```

### Step 4: Collect Responses

Each reviewer produces discourse output:

```markdown
## Discourse from principal-1

AGREE quality-1 "Long function needs decomposition"
  - This aligns with my concern about maintainability

CHALLENGE security-1 "SQL injection risk"
  - The input is already validated at the API layer (see auth/middleware.ts:42)
  - The parameterized query handles this correctly

CONNECT "Missing error handling" → quality-2 "No logging on failures"
  - Both point to incomplete error management

SURFACE
  - Reading quality-1's finding made me realize: the retry logic also lacks timeout handling
```

### Step 5: Compile Discourse Results

Save to `rounds/round-{n}/discourse.md`:

```markdown
# Discourse Results

## Consensus (High Confidence)
- **Missing error handling in auth flow** — Agreed by: principal-1, principal-2, quality-2
- **Long function needs decomposition** — Agreed by: quality-1, principal-1

## Challenged Findings
- **SQL injection risk** (security-1) — Challenged by principal-1
  - Reason: Input validated at API layer, parameterized query used
  - Resolution: Marked as false positive

## Connected Findings
- Error handling + Logging gaps → "Incomplete error management pattern"

## Surfaced in Discourse
- Retry logic lacks timeout handling (from principal-1)

## Clarifying Questions Raised
- "Should the retry logic have a circuit breaker?" (principal-2)
```

## Confidence Adjustment

After discourse, adjust finding confidence:

| Scenario | Confidence Change |
|----------|------------------|
| Multiple reviewers AGREE | +1 (Very High) |
| Finding CHALLENGED and defended | +1 |
| Finding CHALLENGED, not defended | -1 (May remove) |
| Finding CONNECTED to others | +1 |
| SURFACED in discourse | Standard confidence |

## Output Format

The discourse phase produces:
1. `discourse.md` — Full discourse record
2. Adjusted confidence levels for synthesis
3. Connected/grouped findings
4. Resolved challenges (false positives removed)
