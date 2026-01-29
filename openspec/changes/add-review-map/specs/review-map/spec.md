# review-map Specification

## Purpose

The Review Map capability provides a structured, navigable guide for human code reviewers. It analyzes change sets using multi-agent orchestration to produce an ordered, section-based map that helps reviewers understand the overarching approach, find optimal starting points, and track their progress through the review.

## ADDED Requirements

### Requirement: Map Architect Orchestration

The system SHALL provide a Map Architect agent that orchestrates the review map generation process, analyzing change topology and coordinating specialized agents to produce a comprehensive review map.

#### Scenario: Complete map orchestration
- **GIVEN** user requests a review map
- **WHEN** the Map Architect receives the request
- **THEN** the Map Architect SHALL execute the map workflow:
  1. Context Discovery (reuse from review workflow)
  2. Topology Analysis (enumerate files, identify entry points)
  3. Flow Tracing (trace dependencies with redundancy)
  4. Requirements Mapping (if requirements provided)
  5. Map Synthesis (produce ordered map with validation)
  6. Present

#### Scenario: Canonical file list establishment
- **GIVEN** a review map is initiated
- **WHEN** the Map Architect begins topology analysis
- **THEN** the Map Architect SHALL:
  - Execute `git diff --name-only` (or equivalent) to get canonical file list
  - Store the file list in session state
  - Pass the canonical list to all downstream agents
  - Use this list for completeness validation

---

### Requirement: Flow Analyst Agents

The system SHALL spawn Flow Analyst agents with redundancy to trace upstream and downstream dependencies, identifying logical groupings and optimal review ordering.

#### Scenario: Flow tracing with redundancy
- **GIVEN** the Map Architect has established the canonical file list
- **WHEN** Flow Analysts are spawned
- **THEN** the system SHALL spawn 2 Flow Analyst instances by default
- **AND** each Flow Analyst SHALL independently:
  - Identify entry points (API endpoints, CLI commands, event handlers)
  - Trace downstream dependencies (what does each file call?)
  - Trace upstream dependencies (what calls each file?)
  - Group related files into logical flows
  - Propose section ordering

#### Scenario: Flow Analyst exploration
- **GIVEN** a Flow Analyst is analyzing the change set
- **WHEN** the analyst traces dependencies
- **THEN** the analyst SHALL have full agency to:
  - Read complete files beyond the diff
  - Examine import/export statements
  - Follow function calls across files
  - Check test files for coverage patterns
  - Document exploration rationale

---

### Requirement: Requirements Mapper Agent

The system SHALL provide a Requirements Mapper agent that maps changes to requirements/specs when requirements context is provided.

#### Scenario: Requirements mapping
- **GIVEN** user has provided requirements context
- **WHEN** the Requirements Mapper executes
- **THEN** the Requirements Mapper SHALL:
  - Analyze each changed file against stated requirements
  - Identify which requirements each file/section addresses
  - Flag changes that don't map to any stated requirement
  - Note requirements that appear unaddressed by the changes

#### Scenario: No requirements provided
- **GIVEN** user has not provided requirements context
- **WHEN** map workflow executes
- **THEN** the Requirements Mapper phase SHALL be skipped
- **AND** the map SHALL proceed without requirements annotations

---

### Requirement: Section-Based Map Structure

The system SHALL produce a review map organized into logical sections, each representing a cohesive flow or concern within the change set.

#### Scenario: Section organization
- **GIVEN** Flow Analysts have identified logical groupings
- **WHEN** the map is synthesized
- **THEN** each section SHALL contain:
  - Section name and purpose description
  - **Narrative ("The Story")** explaining what these changes accomplish
  - Key patterns or architectural approaches used
  - Requirements addressed (if requirements provided)
  - Ordered list of files with checkbox and brief description
  - Review notes (what to look for, connections to other sections)

#### Scenario: Section narrative content
- **GIVEN** a section is being synthesized
- **WHEN** the narrative is generated
- **THEN** the narrative SHALL:
  - Be framed as a **hypothesis** for the reviewer to verify
  - Explain what we INFER the grouped changes are trying to accomplish
  - Be written as a PR author might explain related changes
  - Connect to the overarching goal of the changeset
  - Reference previous sections when building on established context
  - Set up context for upcoming sections when relevant
  - Create a coherent story that flows through the entire map

#### Scenario: Explicit assumptions
- **GIVEN** a section narrative is generated
- **WHEN** inferences are made about intent or relationships
- **THEN** the section SHALL include an **Assumptions** list that:
  - Explicitly states each assumption the narrative is based on
  - Notes how the assumption was derived (e.g., "based on import analysis")
  - Provides verification points for the reviewer

#### Scenario: Section ordering
- **GIVEN** multiple sections exist in the map
- **WHEN** sections are ordered
- **THEN** sections SHALL be ordered by review priority:
  1. Entry points and public interfaces first
  2. Core implementation and business logic second
  3. Supporting utilities and helpers third
  4. Tests and documentation last
  5. **Unrelated Changes section always last**

---

### Requirement: Unrelated Changes Handling

The system SHALL identify and segregate changes that do not relate to the stated requirements, specifications, or other changes in the logical flow.

#### Scenario: Unrelated change detection
- **GIVEN** a change set is being analyzed
- **WHEN** a file does not relate to:
  - The stated requirements or specifications
  - Other changes in the changeset
  - Any identifiable logical flow
- **THEN** the file SHALL be flagged as potentially unrelated

#### Scenario: Unrelated changes section placement
- **GIVEN** unrelated changes have been identified
- **WHEN** the map is synthesized
- **THEN** the map SHALL include an "Unrelated Changes" section that:
  - Appears at the bottom of the map (after all flow-driven sections)
  - Explicitly notes why each file appears unrelated
  - Maintains the coherent narrative flow in the main sections above
  - Prompts the reviewer to verify whether the changes are:
    - Legitimate but unrelated cleanup/refactoring
    - Accidentally included in the changeset
    - Actually related in ways not detected

#### Scenario: No unrelated changes
- **GIVEN** all changes relate to requirements or logical flows
- **WHEN** the map is synthesized
- **THEN** the Unrelated Changes section MAY be omitted or marked as empty

---

### Requirement: Guaranteed File Completeness

The system SHALL guarantee that every changed file appears in the review map, using tool-call validation to prevent omissions.

#### Scenario: Completeness validation
- **GIVEN** the map synthesis phase begins
- **WHEN** the final map is generated
- **THEN** the system SHALL:
  - Compare all files in the map against the canonical file list
  - Fail synthesis if any file is missing
  - Report which files are missing in the error message

#### Scenario: File index generation
- **GIVEN** a complete map has been generated
- **WHEN** the map is finalized
- **THEN** the map SHALL include a File Index section with:
  - Alphabetical list of all changed files
  - Cross-reference to which section each file appears in
  - Checkbox for each file

---

### Requirement: Checkbox-Based Progress Tracking

The system SHALL format the review map with checkboxes to serve as a progress tracker for human reviewers.

#### Scenario: File-level checkboxes
- **GIVEN** a section lists files to review
- **WHEN** files are rendered in the map
- **THEN** each file SHALL be preceded by a markdown checkbox: `- [ ]`

#### Scenario: Section-level tracking
- **GIVEN** multiple sections exist
- **WHEN** the map is rendered
- **THEN** a summary checklist SHALL appear at the end:
  - `- [ ] Section 1: {name}` for each section
  - `- [ ] All files reviewed`
  - `- [ ] Understood overall approach`

---

### Requirement: Overview and Approach Summary

The system SHALL produce an executive summary at the beginning of the review map explaining the overarching approach taken in the change set.

#### Scenario: Overview content
- **GIVEN** the map synthesis phase executes
- **WHEN** the overview is generated
- **THEN** the overview SHALL include:
  - Brief description of what the PR/change set achieves
  - Key architectural decisions or patterns introduced
  - Notable trade-offs or design choices
  - Suggested focus areas for reviewers

#### Scenario: How to use section
- **GIVEN** a review map is generated
- **WHEN** the map is rendered
- **THEN** the map SHALL include a "How to Use This Map" section explaining:
  - The recommended review order
  - How sections relate to each other
  - What the checkboxes are for

---

### Requirement: Natural Language Activation

The system SHALL support natural language activation for review map generation.

#### Scenario: Natural language triggers
- **GIVEN** user sends a message
- **WHEN** message contains phrases like "map this PR", "create a review map", "help me review this", or "organize these changes"
- **THEN** the map workflow SHALL activate

---

### Requirement: Flexible Requirements Input

The system SHALL accept requirements context flexibly, using the same patterns as the review command.

#### Scenario: Requirements input methods
- **GIVEN** user wants to provide requirements context
- **WHEN** user provides context via:
  - Inline description in the map request
  - Reference to a document path
  - Pasted text
- **THEN** the Map Architect SHALL:
  - Recognize and capture the requirements
  - Pass them to the Requirements Mapper agent
  - Include requirements annotations in the final map

---

### Requirement: Shared Standards Discovery

The system SHALL use the **identical** standards discovery workflow as the review command, as defined in the `context-discovery` capability spec. This provides all agents with project standards, conventions, and high-level context.

#### Scenario: Unified standards discovery workflow
- **GIVEN** map or review command is initiated
- **WHEN** standards discovery phase executes
- **THEN** the system SHALL execute the **exact same** discovery algorithm:
  1. Read `.ocr/config.yaml` for project-specific context and rules (Priority 1)
  2. Pull OpenSpec context from `openspec/config.yaml` and specs (Priority 2)
  3. Discover reference files: AGENTS.md, CLAUDE.md, .cursorrules, etc. (Priority 3)
  4. Load additional user-configured files (Priority 4)
  5. Merge all context with source attribution
  6. Save to `discovered-standards.md` in session directory

#### Scenario: Reuse existing session standards
- **GIVEN** a session already has `discovered-standards.md` from a prior map or review
- **WHEN** the other command runs in the same session
- **THEN** the system SHALL reuse the existing discovered standards (no re-discovery)

#### Scenario: Exhaustive standards coverage
- **GIVEN** standards discovery runs
- **WHEN** project standards are loaded
- **THEN** the discovery MUST be thorough and exhaustive:
  - Read ALL files in the configured discovery sources
  - Do NOT skip or summarize — include complete file contents
  - Preserve priority order for conflict resolution
  - Include OpenSpec specs for architectural context
  - Include active change proposals for awareness of in-flight work

---

### Requirement: Changeset Exploration (Map-Specific)

The map workflow SHALL perform multi-agent, multi-stage exploration of the changeset and surrounding implementation. This is distinct from standards discovery and is specific to the map workflow.

#### Scenario: Multi-agent exploration
- **GIVEN** standards have been discovered
- **WHEN** the map workflow proceeds to changeset exploration
- **THEN** the Map Architect SHALL coordinate multiple agents across multiple stages:
  1. **Topology Analysis** — Enumerate files, identify structure
  2. **Flow Tracing** — Flow Analysts trace dependencies (with redundancy)
  3. **Requirements Mapping** — Map changes to requirements (if provided)
  4. **Synthesis** — Combine findings into coherent map

#### Scenario: Upstream and downstream flow tracing
- **GIVEN** Flow Analysts are exploring the changeset
- **WHEN** agents trace dependencies
- **THEN** each agent SHALL:
  - Trace upstream implementation (what calls/uses the changed code)
  - Trace downstream implementation (what the changed code calls/uses)
  - Document the complete flow context for each change
  - Build understanding of where changes fit in the broader system

#### Scenario: Complete flow picture per change
- **GIVEN** an agent is analyzing a changed file
- **WHEN** the agent explores surrounding implementation
- **THEN** the agent SHALL investigate:
  - Direct callers of changed functions/classes
  - Direct callees of changed functions/classes
  - Related test files
  - Configuration that affects behavior
  - Sibling implementations (e.g., other handlers in the same router)

#### Scenario: Exploration depth
- **GIVEN** agents are exploring the codebase
- **WHEN** tracing dependencies
- **THEN** exploration MUST be deep enough to:
  - Understand the full flow a change participates in
  - Identify entry points that trigger the changed code
  - Identify downstream effects of the change
  - Support accurate section grouping and narrative generation
