# Change: Add CLI Dependency Checks and Doctor Command

## Why

OCR's review workflow depends on an AI coding tool (primarily Claude Code) to execute slash commands like `/ocr-review`. Currently, `ocr init` performs zero external dependency checks -- it writes files without verifying the user can actually use them. Users can complete init, try to run a review, and only then discover Claude Code isn't installed. Additionally, `ocr doctor` exists only as a markdown slash command, requiring an AI tool to be running to check whether the AI tool is available.

## What Changes

- **New `deps.ts` module** -- Dependency checking logic (`checkDependencies()`, `printDepChecks()`) that verifies `git`, `claude`, and `gh` binaries are available in PATH, with version parsing and actionable install hints
- **Init preflight check** -- `ocr init` now runs dependency checks after the banner and before tool selection, showing a compact status block with warnings for missing required tools (non-blocking)
- **New `ocr doctor` CLI command** -- Real binary command that checks both external dependencies and OCR installation status, with exit code 0 (healthy) or 1 (issues found)
- **New `doctor` Nx target** -- `nx run cli:doctor` for development testing

## Impact

- Affected specs: `cli` (new doctor command, modified init command)
- Affected code: `packages/cli/src/lib/deps.ts` (new), `packages/cli/src/commands/doctor.ts` (new), `packages/cli/src/commands/init.ts` (minor addition), `packages/cli/src/index.ts` (command registration), `packages/cli/project.json` (Nx target)
- No breaking changes
