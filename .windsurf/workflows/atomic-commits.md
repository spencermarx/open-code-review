---
description: Analyze staged changes and organize them into intuitive atomic commits following conventional commits.
---

# Atomic Commits Workflow

Analyze staged changes along with relevant requirements and OpenSpec files, then organize and commit them as intuitive atomic commits following conventional commits.

## Prerequisites

- Ensure there are staged changes (`git diff --staged`)
- Review any related OpenSpec change documents in `openspec/changes/`

## Steps

1. **Analyze Staged Changes**
   - Run `git diff --staged --name-only` to list all staged files
   - Run `git diff --staged` to understand the actual changes
   - Group changes by logical concern (feature, fix, refactor, docs, spec, etc.)

2. **Identify Related OpenSpec Documents**
   - Check if any staged changes relate to OpenSpec change documents in `openspec/changes/`
   - If OpenSpec files are staged, note which ones are non-archived (not in `openspec/changes/archive/`)
   - Read relevant OpenSpec documents to understand the context and requirements

3. **Plan Atomic Commits**
   - Organize changes into logical, atomic commits that each represent a single cohesive change
   - Order commits in a sequence that makes sense (dependencies first, features second, cleanup last)
   - **OpenSpec commits**: Any commit related to OpenSpec documents should use the prefix `spec: ...`
   - **Archive commit**: If non-archived OpenSpec change documents are included, plan the **final commit** to archive them using `openspec archive <id> --yes`

4. **Execute Commits Sequentially**
   - For each atomic commit:
     // turbo
     a. Unstage all files: `git reset HEAD`
     // turbo
     b. Stage only the files for this specific commit: `git add <files>`
     // turbo
     c. Commit with a conventional commit message: `git commit -m "<type>(<scope>): <description>"`
   - Conventional commit types: `feat`, `fix`, `refact`, `doc`, `test`, `chore`, `style`, `perf`, `ci`, `build`, `spec`

5. **Archive OpenSpec Changes (Final Commit)**
   - If OpenSpec change documents were part of the staged changes and are non-archived:
     - Run `openspec archive <id> --yes` for each relevant change ID
     - Commit the archive with: `git commit -m "spec: archive <change-id>"`

6. **Verify Commit History**
   // turbo
   - Run `git log --oneline -n <number-of-commits>` to verify the commit sequence
   - Ensure each commit is atomic, well-described, and follows conventional commits

## Conventional Commit Types

| Type       | Description                                          |
|------------|------------------------------------------------------|
| `feat`     | A new feature                                        |
| `fix`      | A bug fix                                            |
| `refact` | Code change that neither fixes a bug nor adds a feature |
| `doc`     | Documentation only changes                           |
| `test`     | Adding or correcting tests                           |
| `chore`    | Maintenance tasks, dependencies, tooling             |
| `style`    | Formatting, white-space, semi-colons, etc.           |
| `perf`     | Performance improvements                             |
| `ci`       | CI/CD configuration changes                          |
| `build`    | Build system or external dependency changes          |
| `spec`     | OpenSpec document changes (proposals, archives)      |

## Example Commit Sequence

```
feat(scheduler): add address autocomplete to new customer form
fix(scheduler): resolve phone validation edge case
refactor(scheduler): extract address validation utility
test(scheduler): add unit tests for address validation
spec: archive add-address-autocomplete-new-customer
```

## Notes

- Each commit should be independently buildable and testable when possible
- Commit messages should be clear and descriptive
- Use scope to indicate the affected area (e.g., `scheduler`, `api`, `ui`)
- The OpenSpec archive commit should always be last when applicable
