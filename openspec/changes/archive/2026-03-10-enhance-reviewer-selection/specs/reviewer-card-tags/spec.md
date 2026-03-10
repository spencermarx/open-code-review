# reviewer-card-tags — Spec Delta

**Parent spec**: `dashboard`

---

## MODIFIED Requirements

### Requirement: Prompt Viewer Dialog Content (modified)

The `PromptViewerSheet` dialog SHALL display full reviewer metadata in its header before the markdown content.

#### Scenario: Focus area tags in prompt viewer
- **GIVEN** a reviewer's prompt viewer dialog is open
- **WHEN** the dialog renders
- **THEN** the header SHALL display:
  - Reviewer icon and name
  - Full description (not truncated)
  - All focus area tags as pill badges (no truncation)
- **AND** the tags SHALL appear between the description and the markdown content area

#### Scenario: Persona fields in prompt viewer
- **GIVEN** a reviewer with tier `persona` has their prompt viewer open
- **WHEN** the dialog renders
- **THEN** the header SHALL additionally display:
  - "Known for" field
  - "Philosophy" field (in italics)
- **AND** these fields SHALL appear between the description and the focus area tags
