# Open Code Review - Agent Instructions

These instructions are for AI assistants performing code reviews in this project.

## Quick Start

When asked to perform a code review:

1. **Read** `SKILL.md` for the Tech Lead role and responsibilities
2. **Follow** `references/workflow.md` for the 8-phase review process
3. **Use** reviewer personas from `references/reviewers/` for multi-perspective analysis
4. **Store** session artifacts in `.ocr/sessions/{timestamp}-{branch}/`

## Available Commands

| Command | Description |
|---------|-------------|
| `/ocr-review` | Start a full code review session |
| `/ocr-map` | Generate a Code Review Map for large changesets |
| `/ocr-doctor` | Check OCR installation and dependencies |
| `/ocr-reviewers` | List available reviewer personas |
| `/ocr-history` | Show past review sessions |
| `/ocr-show` | Display a specific past review |
| `/ocr-post` | Post review to GitHub PR |

## Review Workflow Summary

1. **Context Discovery** - Understand codebase structure and standards
2. **Change Context** - Analyze the specific changes being reviewed
3. **Tech Lead Analysis** - Initial assessment and reviewer team selection
4. **Parallel Reviews** - Each reviewer analyzes from their perspective
5. **Discourse** - Reviewers discuss and debate findings
6. **Synthesis** - Aggregate findings into actionable feedback
7. **Presentation** - Generate final review output

## Key Files

- `SKILL.md` - Core skill definition and Tech Lead role
- `references/workflow.md` - Complete 8-phase review workflow
- `references/map-workflow.md` - 6-phase Code Review Map workflow
- `references/session-files.md` - **Authoritative session file manifest**
- `references/session-state.md` - State management and progress tracking
- `references/final-template.md` - Final review template and synthesis guide
- `references/map-template.md` - Code Review Map output template
- `references/discourse.md` - Multi-agent discourse rules
- `references/reviewers/` - Reviewer persona definitions
- `references/map-personas/` - Map agent persona definitions
