## 1. Dependency Checking Module

- [x] 1.1 Create `packages/cli/src/lib/deps.ts` with `DepCheck`, `DepCheckResult` types
- [x] 1.2 Implement `checkDependencies()` -- checks `git`, `claude`, `gh` via `execFileSync` with version parsing
- [x] 1.3 Implement `printDepChecks()` -- compact preflight block with chalk styling and optional warning suppression

## 2. Init Integration

- [x] 2.1 Add preflight check to `ocr init` after banner, before tool selection (non-blocking)

## 3. Doctor Command

- [x] 3.1 Create `packages/cli/src/commands/doctor.ts` with environment + OCR installation checks
- [x] 3.2 Register command in `packages/cli/src/index.ts`
- [x] 3.3 Add `doctor` target to `packages/cli/project.json`

## 4. Verification

- [x] 4.1 TypeScript compilation clean (`npx tsc --noEmit`)
- [x] 4.2 CLI builds successfully (`npx nx build cli`)
- [x] 4.3 `ocr doctor` shows all-green when deps present (exit 0)
- [x] 4.4 `ocr doctor` shows warnings and exits 1 when required deps missing
