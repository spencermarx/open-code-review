# Tasks: add-universal-agents-skills

## 1. Registry

- [x] 1.1 In `packages/cli/src/lib/config.ts`: add `"agents"` to `AIToolId`; remove `skillsDir` from the type and all entries; make `AIToolConfig` a discriminated union on `kind` (`HostToolConfig` with `commands: { dir, strategy }`, `DiscoveryToolConfig` with `skillPointerDir`).
- [x] 1.2 Add the `agents` entry to `AI_TOOLS`: `kind: "discovery"`, `name: "Universal (.agents)"`, `configDir: ".agents"`, `skillPointerDir: ".agents/skills"`, with no commands, instruction files, or vendor binary. Mark every other entry `kind: "host"`.
- [x] 1.3 Add `isHostTool` (reads `kind`), `skillPointerPath(tool)`, and `SKILL_POINTER_MARKER`.
- [x] 1.4 Update `config.test.ts`: `parseToolsArg("agents")` and `"all"` include `agents`; the pointer path is `.agents/skills/ocr/SKILL.md`; `agents` is the only non-host; `--tool agents` resolves the default capabilities.

## 2. Installer

- [x] 2.1 In `installer.ts`: write command reference files only for hosts (exhaustive switch on `strategy`). Still populate `.ocr/commands/`.
- [x] 2.2 Add `generateSkillPointer()`. It copies the source `SKILL.md` frontmatter verbatim, uses its line ending throughout, and emits the marker line, the repo-root-anchored pointer, and the "run `ocr init` if the file is missing" line.
- [x] 2.3 Write the pointer for discovery targets; leave a `SKILL.md` without the marker untouched and return a warning; return accumulated warnings on failure too.
- [x] 2.4 Detect `agents` for `init` pre-selection by `.agents/skills/`, not a bare `.agents/`.
- [x] 2.5 Add `detectConfiguredTools`, `resolveToolsToUpdate` (saved ids win; legacy fallback adopts discovery targets only through an OCR-managed pointer), and `findStaleSkillPointers`.
- [x] 2.6 Unit tests in `installer.test.ts`: frontmatter identical to the source (independent oracle); marker and anchored path; no commands for `agents`; managed pointer refreshed; foreign `SKILL.md` preserved with a warning; write failure reported; LF and CRLF sources; pre-selection; update resolution; stale pointers.

## 3. Init / update / host commands

- [x] 3.1 `update.ts`: use `resolveToolsToUpdate`; dry-run lists `.agents/skills/ocr/SKILL.md (skill pointer)` under "Would update" and no commands line for it; warn about stale pointers.
- [x] 3.2 `init.ts`: list tool ids in `--tools` help; next steps for discovery-only installs; warn about stale pointers.
- [x] 3.3 `host.ts`: list only host tools in the full `ocr host capabilities` output.
- [x] 3.4 E2E tests in `cli-e2e/src/cli-commands.test.ts`: `init --tools agents`, `update --dry-run`, `update` refresh, `host capabilities` listing and `--tool agents`, `init --help`.

## 4. Docs and validation

- [x] 4.1 Mention the `agents` target in the CLI README / root README tool tables.
- [x] 4.2 Run `nx run cli:test`, `nx run cli:typecheck`, `nx run-many -t lint`, `nx run cli-e2e:e2e`.
- [x] 4.3 Manual check: `ocr init --tools agents` in a scratch directory produces `.ocr/skills/`, `.ocr/commands/`, `AGENTS.md` (managed block), and `.agents/skills/ocr/SKILL.md`, with no `.agents/commands/`.
- [x] 4.4 `openspec validate add-universal-agents-skills --strict`
