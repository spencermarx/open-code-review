## ADDED Requirements

### Requirement: Doctor Command

The CLI SHALL provide a `doctor` command that checks external dependencies and OCR installation status, providing actionable remediation for any issues found.

#### Scenario: All checks pass

- **GIVEN** `git`, `claude`, and `gh` are in PATH and OCR is initialized
- **WHEN** user runs `ocr doctor`
- **THEN** a compact status block shows green checkmarks with version numbers for all dependencies
- **AND** OCR installation checks show `.ocr/skills/`, `.ocr/sessions/`, `.ocr/config.yaml`, `.ocr/data/ocr.db`
- **AND** "Ready for code review!" summary is displayed
- **AND** the process exits with code 0

#### Scenario: Required dependency missing

- **GIVEN** `claude` is not in PATH
- **WHEN** user runs `ocr doctor`
- **THEN** the preflight block shows a red `✗` next to "Claude Code" with "not found"
- **AND** the summary shows "Issues found" with an install URL
- **AND** the process exits with code 1

#### Scenario: Optional dependency missing

- **GIVEN** `gh` (GitHub CLI) is not in PATH but all required deps are present
- **WHEN** user runs `ocr doctor`
- **THEN** the preflight block shows a dim `✗` next to "GitHub CLI" with "not found (optional)"
- **AND** the summary shows "Ready for code review!" (optional deps do not cause failure)
- **AND** the process exits with code 0

#### Scenario: OCR not initialized

- **GIVEN** `.ocr/` directory does not exist
- **WHEN** user runs `ocr doctor`
- **THEN** OCR installation checks show dim `✗` for all OCR paths
- **AND** the summary shows "Issues found" with instruction to run `ocr init`
- **AND** the process exits with code 1

#### Scenario: Informational OCR checks

- **GIVEN** `.ocr/data/ocr.db` does not exist (no review run yet)
- **WHEN** user runs `ocr doctor`
- **THEN** the database check shows dim `✗` with "(created on first review)" hint
- **AND** this does NOT cause exit code 1 (informational only)

---

### Requirement: Init Preflight Check

The `ocr init` command SHALL display a dependency check block after the banner and before tool selection, without blocking initialization.

#### Scenario: All dependencies found

- **GIVEN** `git`, `claude`, and `gh` are in PATH
- **WHEN** user runs `ocr init`
- **THEN** a "Preflight" block shows green checkmarks with versions for all dependencies
- **AND** tool selection proceeds normally

#### Scenario: Required dependency missing during init

- **GIVEN** `claude` is not in PATH
- **WHEN** user runs `ocr init`
- **THEN** the preflight block shows a red `✗` for Claude Code with "not found"
- **AND** a yellow warning with install URL is displayed
- **AND** initialization continues (non-blocking)
- **AND** tool selection proceeds normally

---

### Requirement: Dependency Check Module

The CLI SHALL provide a shared internal module for checking external binary dependencies, used by both `init` and `doctor` commands.

#### Scenario: Check binary availability

- **GIVEN** a list of dependencies to check (git, claude, gh)
- **WHEN** `checkDependencies()` is called
- **THEN** each binary is tested via `execFileSync(binary, ['--version'])` with a 5-second timeout
- **AND** the version is parsed from stdout using a semver-like regex
- **AND** the result includes `found`, `version`, `required`, and `installHint` for each dependency

#### Scenario: Print dependency status

- **GIVEN** a `DepCheckResult` from `checkDependencies()`
- **WHEN** `printDepChecks()` is called
- **THEN** a column-aligned block is printed with checkmarks/X marks and versions
- **AND** missing required deps show red `✗` with warnings (unless `suppressWarnings` is true)
- **AND** missing optional deps show dim `✗` with "(optional)" suffix
