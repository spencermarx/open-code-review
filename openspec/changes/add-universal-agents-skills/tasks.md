# Tasks: add-universal-agents-skills

## 1. Registry

- [x] 1.1 In `packages/cli/src/lib/config.ts`: add `"agents"` to `AIToolId`; make `commandsDir` and `commandStrategy` optional; add optional `skillPointerDir`; remove `skillsDir` from the type and all entries.
- [x] 1.2 Add the `agents` entry to `AI_TOOLS`: `name: "Universal (.agents)"`, `configDir: ".agents"`, `skillPointerDir: ".agents/skills"`, with no commands, instruction files, or vendor binary.
- [x] 1.3 Update `config.test.ts`: `parseToolsArg("agents")` and `"all"` include `agents`; no entry declares `skillsDir`; only `agents` declares `skillPointerDir`.

## 2. Installer

- [x] 2.1 In `installer.ts`: skip `installCommandsForTool` when `commandsDir` is absent. Still populate `.ocr/commands/`.
- [x] 2.2 Add `generateSkillPointer()`. It reads the source `SKILL.md` frontmatter verbatim and emits the pointer body, including the fallback "run `ocr init` if the file is missing" line. When `skillPointerDir` is set, write the result to `<skillPointerDir>/ocr/SKILL.md`.
- [x] 2.3 Unit tests in `installer.test.ts`:
  - pointer created with frontmatter identical to the source;
  - `name: ocr` matches the directory name;
  - body references `.ocr/skills/SKILL.md`;
  - no commands directory created for `agents`;
  - `.ocr/skills/` and `.ocr/commands/` still populated;
  - re-install overwrites the pointer.

## 3. Update / host commands

- [x] 3.1 In `update.ts#detectConfiguredTools`: detect `agents` by `<skillPointerDir>/ocr/SKILL.md`, and skip command-based checks when `commandsDir` is absent.
- [x] 3.2 In the `update.ts` dry-run listing: print `.agents/skills/ocr/SKILL.md (skill pointer)` for `agents`, and no commands line for it.
- [x] 3.3 In `host.ts`: exclude entries without `vendorBinary` and without `commandsDir` (that is, `agents`) from the full `ocr host capabilities` listing.

## 4. Docs and validation

- [x] 4.1 Mention the `agents` target in the CLI README / root README tool tables, if they list tool IDs.
- [x] 4.2 Run `nx run cli:test`, `nx run cli:typecheck`, `nx run-many -t lint`.
- [x] 4.3 Manual check: `ocr init --tools agents` in a scratch directory produces `.ocr/skills/`, `.ocr/commands/`, `AGENTS.md` (managed block), and `.agents/skills/ocr/SKILL.md`, with no `.agents/commands/`.
- [x] 4.4 `openspec validate add-universal-agents-skills --strict`
