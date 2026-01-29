## ADDED Requirements

### Requirement: Existing Map Reference

The review workflow SHALL support natural language references to existing map artifacts, allowing the Tech Lead to use a previously-generated map as additional context when explicitly referenced by the user.

#### Scenario: Natural language map reference
- **GIVEN** user requests a review and references an existing map
- **WHEN** message contains phrases like "I've already generated a map", "use the map I created", "check the map in this session", or similar
- **THEN** the Tech Lead SHALL:
  - Check for existing map artifacts in the session's `map/` directory
  - If found: Read the latest run's `map.md` as supplementary context
  - If not found: Inform user no map exists and proceed with standard review

#### Scenario: Map as supplementary context
- **GIVEN** user has referenced an existing map
- **WHEN** Tech Lead reads the map artifacts
- **THEN** the Tech Lead MAY use the map to:
  - Gain additional understanding of changeset structure
  - Reference section groupings when summarizing changes
  - Note the map's hypotheses as background context
- **AND** the Tech Lead SHALL still perform standard investigation independently

#### Scenario: No automatic map usage
- **GIVEN** a map exists in the session
- **WHEN** user does NOT explicitly reference the map during review
- **THEN** the system SHALL NOT automatically use map artifacts
- **AND** the review SHALL proceed with standard context gathering

#### Scenario: Map and review as orthogonal tools
- **GIVEN** user runs `/ocr:review` without referencing a map
- **WHEN** the review workflow executes
- **THEN** the standard review workflow SHALL proceed unchanged:
  - Tech Lead performs initial analysis with standard context gathering
  - Reviewer sub-agents explore upstream/downstream as needed
  - No dependency on map artifacts
