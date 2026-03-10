# create-reviewer-skill — Spec Delta

**Capability**: `reviewer-management`

## ADDED Requirements

### Requirement: Create Reviewer AI Command

The system SHALL provide a `/ocr:create-reviewer` AI command that generates a new reviewer markdown file from a natural language description.

#### Scenario: Create a new specialist reviewer

- **GIVEN** user invokes `create-reviewer api-design --focus "REST API design, backwards compatibility, versioning, error response consistency"`
- **WHEN** `api-design.md` does not already exist in `.ocr/skills/references/reviewers/`
- **THEN** the AI SHALL:
  1. Read the reviewer template from `.ocr/skills/assets/reviewer-template.md`
  2. Read 2-3 existing reviewer files as style exemplars
  3. Generate a well-structured reviewer `.md` file adhering to the template
  4. Write the file to `.ocr/skills/references/reviewers/api-design.md`
  5. Run the sync flow (scan all reviewers, build JSON, pipe to `ocr reviewers sync --stdin`)
  6. Report the new reviewer's name, tier, and focus areas

#### Scenario: Duplicate prevention

- **GIVEN** user invokes `create-reviewer security --focus "..."`
- **WHEN** `security.md` already exists
- **THEN** the AI SHALL report that the reviewer already exists
- **AND** suggest using `/ocr:edit-reviewer security` instead

#### Scenario: Slug normalization

- **GIVEN** the reviewer name contains spaces or special characters
- **WHEN** deriving the filename
- **THEN** the name SHALL be normalized to lowercase with hyphens (e.g., "API Design" → `api-design.md`)

#### Scenario: Template adherence

- **WHEN** the AI generates a reviewer file
- **THEN** the file SHALL adhere to the structure defined in `.ocr/skills/assets/reviewer-template.md`
- **AND** the template file is the authoritative source of truth for section ordering and format
- **AND** as of this writing, the required sections are:
  - `# {Name} Reviewer` heading
  - `## Your Focus Areas` with 4-6 bolded focus areas
  - `## Your Review Approach` with 4 numbered steps
  - `## What You Look For` with 3 categories of checklist items
  - `## Your Output Style` with 4 guidelines
  - `## Agency Reminder` encouraging codebase exploration

#### Scenario: Auto-sync after creation

- **WHEN** the reviewer file is successfully written
- **THEN** the AI SHALL automatically run the sync flow
- **AND** the updated `reviewers-meta.json` SHALL include the new reviewer
