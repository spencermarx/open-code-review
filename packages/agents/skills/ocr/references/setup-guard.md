# OCR Setup Guard

**This is a sub-skill that MUST be called at the start of ALL OCR skills and commands.**

## Purpose

Validate that OCR is properly set up before proceeding with any review operations. This prevents confusing errors and provides clear guidance when setup is incomplete.

## Installation Modes

OCR supports two installation modes:

| Mode | Skills Location | Commands Location | How to Install |
|------|-----------------|-------------------|----------------|
| **CLI** | `.ocr/skills/` | `.ocr/commands/` | `npx @open-code-review/cli init` |
| **Plugin** | Plugin cache | Plugin cache | `/plugin install open-code-review` |

**The setup guard adapts based on which mode is detected.**

## Directory Structure

```
.ocr/
├── commands/     # Central command definitions (CLI mode)
├── skills/       # Skill files (CLI mode, symlinked or copied)
└── sessions/     # Review session storage (both modes)
```

## When to Use

Call this guard at the **very beginning** of:
- `/ocr-review` or `/open-code-review:review` - Before starting any code review
- `/ocr-show` or `/open-code-review:show` - Before displaying past sessions
- `/ocr-history` or `/open-code-review:history` - Before listing sessions
- `/ocr-post` or `/open-code-review:post` - Before posting to GitHub
- Any other OCR operation that requires session storage

## Validation Steps

Execute these checks in order:

### 1. Detect Installation Mode

First, determine how OCR was installed:

```bash
# Check for CLI mode (skills in project)
ls -la .ocr/skills/SKILL.md 2>/dev/null && echo "CLI_MODE"

# If no local skills, check if running as plugin
# (Plugin mode = skills accessed from plugin, only sessions dir needed locally)
```

**CLI Mode**: `.ocr/skills/` exists → validate full CLI setup
**Plugin Mode**: No `.ocr/skills/` but OCR commands work → only need sessions directory

### 2. CLI Mode Validation

If `.ocr/skills/` exists (CLI mode):

**Check for .ocr Directory:**
```bash
ls -la .ocr/ 2>/dev/null || echo "NOT_FOUND"
```

**If NOT_FOUND:**
```
⛔ OCR is not set up in this project.

To set up OCR, run:

  npx @open-code-review/cli init

This will install OCR skills, commands, and create the sessions directory.
```
**Then STOP.**

**Check for Skills Directory:**
```bash
ls -la .ocr/skills/SKILL.md 2>/dev/null || echo "NOT_FOUND"
```

**If NOT_FOUND:**
```
⛔ OCR skills are missing.

The .ocr directory exists but skills are not installed.

To fix, run:

  npx @open-code-review/cli init
```
**Then STOP.**

### 3. Plugin Mode Validation

If running as a Claude Code plugin (no `.ocr/skills/` but command is accessible):

**Check for sessions directory:**
```bash
ls -la .ocr/sessions/ 2>/dev/null || echo "NOT_FOUND"
```

**If NOT_FOUND:**
```
📦 Plugin mode detected - initializing project...

Creating .ocr/sessions/ directory for review storage.
```

Then create the directory:
```bash
mkdir -p .ocr/sessions
```

Create `.ocr/.gitignore` if it doesn't exist:
```bash
echo "sessions/" > .ocr/.gitignore
```

### 4. Bootstrap Sessions Directory (JIT)

For both modes, ensure sessions directory exists:

```bash
mkdir -p .ocr/sessions
```

This is safe to do automatically since it's just an empty directory for storing review sessions.

## Success Response

If all checks pass, respond briefly and proceed:

```
✓ OCR setup verified
```

Then continue with the requested operation.

## Integration Example

At the start of any OCR skill execution:

```markdown
# Before doing anything else:
1. Read and execute `references/setup-guard.md`
2. If setup guard fails, STOP and show the error message
3. If setup guard passes, proceed with the requested operation
```

## Why This Matters

- **Better DX**: Users get clear, actionable feedback instead of cryptic errors
- **Fail Fast**: Problems are caught immediately, not mid-operation
- **Consistent UX**: Every OCR command behaves the same way when setup is missing
- **Self-Documenting**: The error messages tell users exactly how to fix the issue
- **Dual Mode**: Works seamlessly whether installed via CLI or Claude Code plugin
