---
description: Approve an OpenSpec proposal and begin implementation with best practices.
auto_execution_mode: 3
---

**Usage**
```
/openspec-approve <change-id>
```
Example: `/openspec-approve add-video-upload-support`

**Guardrails**
- Think step by step like Martin Fowler and Kent Dodds—favor composition, clear boundaries, and incremental progress.
- Adhere to existing patterns, best practices, and project standards (`openspec/project.md` and `apps/dev-docs/docs/guides/coding-standards.md`).
- Stop at the end of each task set so that the user can review changes and provide feedback.

**Steps**
1. Mark the proposal as approved: update `changes/<id>/proposal.md` status to `approved` if not already.
2. Read `openspec/project.md` and `apps/dev-docs/docs/guides/coding-standards.md` to ground implementation in project standards.
3. Execute `/openspec-apply <change-id>` to implement the approved proposal. Be sure to specify that we want to stop at the end of each task set so that the user can review changes and provide feedback.

