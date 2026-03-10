# reviewer-library — Spec Delta

**Parent spec**: `reviewer-management`

---

## ADDED Requirements

### Requirement: Reviewer Tier Classification

The system SHALL classify every reviewer persona into exactly one tier.

#### Scenario: Holistic generalist reviewer
- **GIVEN** a reviewer persona focused on broad, leadership-level review
- **WHEN** the reviewer is classified
- **THEN** the reviewer SHALL have tier `holistic`
- **AND** the reviewer SHALL review all aspects of code through their leadership lens

#### Scenario: Domain specialist reviewer
- **GIVEN** a reviewer persona with deep expertise in a specific domain
- **WHEN** the reviewer is classified
- **THEN** the reviewer SHALL have tier `specialist`
- **AND** the reviewer SHALL review all aspects but weight findings toward their specialty

#### Scenario: Famous engineer persona reviewer
- **GIVEN** a reviewer persona modeled after a notable software engineer
- **WHEN** the reviewer is classified
- **THEN** the reviewer SHALL have tier `persona`
- **AND** the reviewer's approach SHALL be grounded in the engineer's published works and known philosophy

#### Scenario: Custom user-created reviewer
- **GIVEN** a reviewer persona created by the user (not shipped with OCR)
- **WHEN** the reviewer is classified
- **THEN** the reviewer SHALL have tier `custom`

---

### Requirement: Famous Persona Header Format

Each famous engineer persona file SHALL include a structured blockquote header.

#### Scenario: Persona file includes blockquote header
- **GIVEN** a reviewer with tier `persona`
- **WHEN** the persona file is read
- **THEN** it SHALL contain a blockquote section with:
  - `**Known for**:` followed by a one-line summary of their primary contribution
  - `**Philosophy**:` followed by 1-3 sentences summarizing their core engineering philosophy
- **AND** this blockquote SHALL appear between the `# Title` heading and the body of the persona

#### Scenario: Non-persona reviewers omit blockquote
- **GIVEN** a reviewer with tier `holistic`, `specialist`, or `custom`
- **WHEN** the persona file is read
- **THEN** the blockquote header section SHALL NOT be required

---

### Requirement: Built-in Holistic Generalist Reviewers

The system SHALL ship with five holistic generalist reviewer personas.

#### Scenario: Software Architect persona
- **GIVEN** the `architect` reviewer is selected
- **WHEN** reviewing code
- **THEN** the reviewer SHALL focus on: system boundaries, contracts, evolutionary architecture, coupling

#### Scenario: Full-Stack Engineer persona
- **GIVEN** the `fullstack` reviewer is selected
- **WHEN** reviewing code
- **THEN** the reviewer SHALL focus on: end-to-end coherence, vertical slice quality, integration points

#### Scenario: Reliability Engineer persona
- **GIVEN** the `reliability` reviewer is selected
- **WHEN** reviewing code
- **THEN** the reviewer SHALL focus on: failure modes, resilience, observability, degradation paths

#### Scenario: Staff Engineer persona
- **GIVEN** the `staff-engineer` reviewer is selected
- **WHEN** reviewing code
- **THEN** the reviewer SHALL focus on: cross-team impact, technical strategy, mentoring, organizational patterns

#### Scenario: Principal Engineer persona
- **GIVEN** the `principal` reviewer is selected
- **WHEN** reviewing code
- **THEN** the reviewer SHALL focus on: architecture, system design, engineering best practices, technical leadership

---

### Requirement: Built-in Domain Specialist Reviewers

The system SHALL ship with thirteen domain specialist reviewer personas.

#### Scenario: Principal Frontend Engineer persona
- **GIVEN** the `frontend` reviewer is selected
- **WHEN** reviewing code
- **THEN** the reviewer SHALL focus on: component design, state management, rendering performance, accessibility

#### Scenario: Principal Backend Engineer persona
- **GIVEN** the `backend` reviewer is selected
- **WHEN** reviewing code
- **THEN** the reviewer SHALL focus on: API design, data modeling, concurrency, observability

#### Scenario: Principal Infrastructure Engineer persona
- **GIVEN** the `infrastructure` reviewer is selected
- **WHEN** reviewing code
- **THEN** the reviewer SHALL focus on: deployment, scaling, resource efficiency, infrastructure as code

#### Scenario: Principal Performance Engineer persona
- **GIVEN** the `performance` reviewer is selected
- **WHEN** reviewing code
- **THEN** the reviewer SHALL focus on: profiling, bottlenecks, algorithmic complexity, caching

#### Scenario: Principal Accessibility Engineer persona
- **GIVEN** the `accessibility` reviewer is selected
- **WHEN** reviewing code
- **THEN** the reviewer SHALL focus on: WCAG compliance, screen reader support, keyboard navigation, color contrast

#### Scenario: Principal Data Engineer persona
- **GIVEN** the `data` reviewer is selected
- **WHEN** reviewing code
- **THEN** the reviewer SHALL focus on: schemas, migrations, query efficiency, data integrity

#### Scenario: Principal DevOps Engineer persona
- **GIVEN** the `devops` reviewer is selected
- **WHEN** reviewing code
- **THEN** the reviewer SHALL focus on: CI/CD, infrastructure as code, rollback safety, monitoring

#### Scenario: Principal DX Engineer persona
- **GIVEN** the `dx` reviewer is selected
- **WHEN** reviewing code
- **THEN** the reviewer SHALL focus on: API ergonomics, error messages, developer productivity, documentation

#### Scenario: Principal Mobile Engineer persona
- **GIVEN** the `mobile` reviewer is selected
- **WHEN** reviewing code
- **THEN** the reviewer SHALL focus on: platform conventions, offline support, battery efficiency, responsiveness

#### Scenario: Security Engineer persona
- **GIVEN** the `security` reviewer is selected
- **WHEN** reviewing code
- **THEN** the reviewer SHALL focus on: authentication, authorization, vulnerability patterns, data protection

#### Scenario: Quality Engineer persona
- **GIVEN** the `quality` reviewer is selected
- **WHEN** reviewing code
- **THEN** the reviewer SHALL focus on: code style, readability, best practices, maintainability

#### Scenario: Testing Engineer persona
- **GIVEN** the `testing` reviewer is selected
- **WHEN** reviewing code
- **THEN** the reviewer SHALL focus on: test coverage, edge cases, assertions, testing patterns

#### Scenario: AI Engineer persona
- **GIVEN** the `ai` reviewer is selected
- **WHEN** reviewing code
- **THEN** the reviewer SHALL focus on: LLM integration, prompt engineering, model evaluation, AI safety

---

### Requirement: Built-in Famous Engineer Persona Reviewers

The system SHALL ship with ten famous engineer persona reviewers.

#### Scenario: Martin Fowler persona
- **GIVEN** the `martin-fowler` reviewer is selected
- **WHEN** reviewing code
- **THEN** the reviewer SHALL focus on: refactoring, code smells, evolutionary design, patterns
- **AND** the review approach SHALL reflect Fowler's emphasis on behavior-preserving transformations

#### Scenario: Kent Beck persona
- **GIVEN** the `kent-beck` reviewer is selected
- **WHEN** reviewing code
- **THEN** the reviewer SHALL focus on: simplicity, test-driven development, incremental design
- **AND** the review approach SHALL reflect Beck's "make it work, make it right, make it fast"

#### Scenario: John Ousterhout persona
- **GIVEN** the `john-ousterhout` reviewer is selected
- **WHEN** reviewing code
- **THEN** the reviewer SHALL focus on: deep vs. shallow modules, complexity management, information hiding
- **AND** the review approach SHALL reflect Ousterhout's "A Philosophy of Software Design"

#### Scenario: Anders Hejlsberg persona
- **GIVEN** the `anders-hejlsberg` reviewer is selected
- **WHEN** reviewing code
- **THEN** the reviewer SHALL focus on: type system design, language ergonomics, developer experience
- **AND** the review approach SHALL reflect Hejlsberg's work on TypeScript and C#

#### Scenario: Vladimir Khorikov persona
- **GIVEN** the `vladimir-khorikov` reviewer is selected
- **WHEN** reviewing code
- **THEN** the reviewer SHALL focus on: domain-driven testing, unit test value, functional architecture
- **AND** the review approach SHALL reflect Khorikov's "Unit Testing Principles, Practices, and Patterns"

#### Scenario: Kent Dodds persona
- **GIVEN** the `kent-dodds` reviewer is selected
- **WHEN** reviewing code
- **THEN** the reviewer SHALL focus on: React composition patterns, component design, colocation, custom hooks, pragmatic testing strategy
- **AND** the review approach SHALL reflect Dodds' Epic React, Testing Library, and AHA (Avoid Hasty Abstractions) philosophy

#### Scenario: Tanner Linsley persona
- **GIVEN** the `tanner-linsley` reviewer is selected
- **WHEN** reviewing code
- **THEN** the reviewer SHALL focus on: headless UI patterns, composability, framework-agnostic design
- **AND** the review approach SHALL reflect Linsley's work on TanStack libraries

#### Scenario: Kamil Myśliwiec persona
- **GIVEN** the `kamil-mysliwiec` reviewer is selected
- **WHEN** reviewing code
- **THEN** the reviewer SHALL focus on: modular architecture, dependency injection, progressive framework design
- **AND** the review approach SHALL reflect Myśliwiec's work on NestJS

#### Scenario: Sandi Metz persona
- **GIVEN** the `sandi-metz` reviewer is selected
- **WHEN** reviewing code
- **THEN** the reviewer SHALL focus on: practical OO, SOLID principles, cost of change
- **AND** the review approach SHALL reflect Metz's "99 Bottles of OOP" and "POODR"

#### Scenario: Rich Hickey persona
- **GIVEN** the `rich-hickey` reviewer is selected
- **WHEN** reviewing code
- **THEN** the reviewer SHALL focus on: simplicity vs. easiness, immutability, value-oriented programming
- **AND** the review approach SHALL reflect Hickey's "Simple Made Easy" and Clojure design principles

---

## MODIFIED Requirements

### Requirement: Reviewer Persona Structure (modified)

Each reviewer persona SHALL be defined as a markdown file with standard sections and an optional persona header.

#### Scenario: Standard persona file structure
- **GIVEN** a reviewer persona file with tier `holistic`, `specialist`, or `custom`
- **WHEN** the file is read
- **THEN** it SHALL contain:
  - Identity (background and perspective)
  - Focus areas (what to look for)
  - How You Review (approach and principles)
  - Project Standards reminder

#### Scenario: Famous persona file structure
- **GIVEN** a reviewer persona file with tier `persona`
- **WHEN** the file is read
- **THEN** it SHALL contain all standard sections
- **AND** it SHALL contain a blockquote header with "Known for" and "Philosophy" fields
