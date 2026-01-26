# Review Orchestration

Core multi-agent code review workflow orchestrated by the Tech Lead.

## ADDED Requirements

### Requirement: Tech Lead Orchestration

The system SHALL provide a Tech Lead agent that orchestrates the complete code review process, coordinating context discovery, requirements analysis, reviewer assignment, discourse facilitation, and final synthesis.

#### Scenario: Complete review orchestration
- **GIVEN** user requests a code review
- **WHEN** the Tech Lead receives the request
- **THEN** Tech Lead SHALL execute the 8-phase workflow:
  1. Context Discovery (including requirements/specs)
  2. Gather Change Context
  3. Tech Lead Analysis
  4. Spawn Reviewers (with Redundancy)
  5. Aggregate Redundant Findings
  6. Discourse (unless --quick)
  7. Synthesis
  8. Present

#### Scenario: Tech Lead analysis
- **GIVEN** change context and requirements have been gathered
- **WHEN** Tech Lead analyzes the change
- **THEN** Tech Lead SHALL:
  - Review requirements/specs to understand intended behavior
  - Summarize what changed and why
  - Evaluate changes against requirements
  - Identify risks and areas of concern
  - Select appropriate reviewers
  - Create dynamic guidance per reviewer including requirements context

---

### Requirement: Requirements Context Input

The system SHALL accept requirements context flexibly, leveraging the AI agent's ability to discover and interpret requirements from any source the user provides.

#### Scenario: Flexible requirements input
- **GIVEN** user wants to provide requirements context
- **WHEN** user provides context via ANY of:
  - Inline description in the review request
  - Reference to a document path (spec, proposal, ticket, etc.)
  - Pasted text (bug report, acceptance criteria, notes)
- **THEN** the Tech Lead SHALL:
  - Recognize the intent to provide requirements
  - Read referenced documents if paths are provided
  - Capture and interpret the requirements
  - Propagate to all reviewer sub-agents

#### Scenario: Agent-driven requirements discovery
- **GIVEN** user mentions requirements exist somewhere
- **WHEN** the reference is ambiguous or incomplete
- **THEN** the Tech Lead MAY:
  - Search for likely spec/requirements files
  - Ask the user to clarify which document
  - Proceed with partial context and note the limitation

#### Scenario: No explicit requirements
- **GIVEN** user does not provide explicit requirements
- **WHEN** review is initiated
- **THEN** the system SHALL proceed using:
  - Discovered project standards
  - Best practices for the technology
  - Professional engineering judgment

---

### Requirement: Clarifying Questions and Scope Boundaries

The Tech Lead and all reviewer sub-agents SHALL surface clarifying questions about requirements ambiguity and scope boundaries, just as engineers do in real code reviews.

#### Scenario: Requirements ambiguity
- **GIVEN** requirements/specs contain ambiguous language
- **WHEN** the Tech Lead or a reviewer encounters the ambiguity
- **THEN** the reviewer SHALL:
  - Note the specific ambiguity
  - State their interpretation
  - Ask a clarifying question in the review output

#### Scenario: Scope boundary questions
- **GIVEN** a reviewer is uncertain whether something should be included or excluded
- **WHEN** the change appears to either:
  - Include functionality not explicitly required
  - Exclude functionality that might be expected
- **THEN** the reviewer SHALL surface a scope question:
  - "Should this include X?" or "Was X intentionally excluded?"
  - Provide reasoning for why this is worth clarifying

#### Scenario: Missing acceptance criteria
- **GIVEN** requirements lack clear acceptance criteria
- **WHEN** a reviewer cannot determine if a requirement is met
- **THEN** the reviewer SHALL:
  - State what acceptance criteria they would expect
  - Note whether the implementation appears reasonable
  - Flag for discussion with stakeholders

#### Scenario: Edge case uncertainty
- **GIVEN** requirements do not specify edge case behavior
- **WHEN** a reviewer identifies unhandled edge cases
- **THEN** the reviewer SHALL:
  - List the edge cases
  - Ask whether they should be handled
  - Suggest how they might be handled if implemented

#### Scenario: Clarifying questions in synthesis
- **GIVEN** reviewers raised clarifying questions
- **WHEN** final synthesis is generated
- **THEN** the synthesis SHALL include a "Clarifying Questions" section:
  - Questions about requirements ambiguity
  - Questions about scope boundaries
  - Questions about edge cases
  - These SHALL be surfaced prominently for stakeholder response

---

### Requirement: Natural Language Activation

The system SHALL auto-activate when the user asks to review code using natural language phrases.

#### Scenario: Natural language triggers
- **GIVEN** user sends a message
- **WHEN** message contains phrases like "review my code", "review this PR", "code review please", "check my changes", or "want feedback on my work"
- **THEN** the OCR skill SHALL activate and begin the review workflow

#### Scenario: No false activation
- **GIVEN** user discusses code review concepts without requesting one
- **WHEN** message is about code review theory or past reviews
- **THEN** the OCR skill SHALL NOT auto-activate

---

### Requirement: Explicit Command Activation

The system SHALL support explicit activation via the `/ocr:review` slash command with configurable options.

#### Scenario: Review staged changes (default)
- **GIVEN** user invokes `/ocr:review` without arguments
- **WHEN** staged changes exist in the repository
- **THEN** the system SHALL review the staged changes

#### Scenario: Review commit range
- **GIVEN** user invokes `/ocr:review HEAD~3..HEAD`
- **WHEN** the commit range is valid
- **THEN** the system SHALL review the specified commit range

#### Scenario: Review pull request
- **GIVEN** user invokes `/ocr:review pr 123`
- **WHEN** PR #123 exists and `gh` CLI is available
- **THEN** the system SHALL review the pull request diff

#### Scenario: Quick mode
- **GIVEN** user invokes `/ocr:review --quick`
- **WHEN** review workflow runs
- **THEN** the system SHALL skip the discourse phase

#### Scenario: Override redundancy
- **GIVEN** user invokes `/ocr:review --redundancy 3`
- **WHEN** review workflow runs
- **THEN** each reviewer SHALL run 3 times regardless of config

---

### Requirement: Reviewer Sub-Agent Spawning

The system SHALL spawn independent reviewer sub-agents using the Task tool, each receiving persona, project context, requirements, and Tech Lead guidance.

#### Scenario: Default reviewer team composition
- **GIVEN** user requests a review without specifying team composition
- **WHEN** Tech Lead spawns reviewers
- **THEN** the system SHALL spawn by default:
  - 2 Tasks for principal (principal-1, principal-2) - holistic architecture review
  - 2 Tasks for quality (quality-1, quality-2) - code quality review
- **AND** the system MAY optionally spawn based on change type:
  - 1 Task for security (security-1) - if auth/API/data changes detected
  - 1 Task for testing (testing-1) - if logic changes detected

#### Scenario: User-specified team composition
- **GIVEN** user specifies reviewer team in request
- **WHEN** user says "review with security focus" or "add testing reviewer" or similar
- **THEN** the Tech Lead SHALL adjust team composition accordingly

#### Scenario: Dynamic redundancy override
- **GIVEN** user specifies redundancy in request
- **WHEN** user says "use 3 principal reviewers" or "--redundancy 3" or similar
- **THEN** the system SHALL use the specified redundancy

#### Scenario: Reviewer independence
- **GIVEN** multiple reviewer Tasks are spawned
- **WHEN** each reviewer executes
- **THEN** reviewers SHALL NOT see each other's outputs during their review

#### Scenario: Reviewer context injection
- **GIVEN** a reviewer Task is spawned
- **WHEN** the reviewer begins work
- **THEN** the reviewer SHALL receive:
  - Static persona (from reviewers/*.md)
  - Discovered project context
  - Requirements/specs/proposal content (if provided)
  - Dynamic Tech Lead guidance
  - The diff and intent information

---

### Requirement: Codebase Exploration and Reviewer Agency

Each reviewer SHALL have full agency to explore the codebase as they see fit, determining what is relevant based on requirements, change goals, and their professional judgment—just as a real engineer would.

#### Scenario: Autonomous exploration
- **GIVEN** a reviewer is analyzing a code change
- **WHEN** the reviewer begins their review
- **THEN** the reviewer SHALL autonomously decide:
  - Which files to read beyond the diff
  - How deep to trace dependencies
  - What related code to examine
  - Whether to examine tests, configs, or documentation

#### Scenario: Requirements-driven exploration
- **GIVEN** requirements/specs have been provided
- **WHEN** the reviewer explores the codebase
- **THEN** the reviewer SHALL:
  - Identify code paths relevant to stated requirements
  - Trace implementation to verify requirements are met
  - Check edge cases implied by requirements
  - Examine related tests for requirements coverage

#### Scenario: Trace code relationships
- **GIVEN** a reviewer is analyzing a code change
- **WHEN** the reviewer evaluates the change
- **THEN** the reviewer MAY:
  - Read FULL files, not just diff hunks
  - Trace upstream (what calls this?)
  - Trace downstream (what does this call?)
  - Check patterns (how is similar code handled?)
  - Review related tests
  - Examine configuration and environment
  - Read documentation or comments

#### Scenario: Document exploration
- **GIVEN** a reviewer explores the codebase
- **WHEN** the reviewer documents findings
- **THEN** the review output SHALL include a "What I Explored" section listing:
  - Files examined and why
  - Code paths traced
  - How exploration informed findings

#### Scenario: Professional judgment
- **GIVEN** a reviewer has agency to explore
- **WHEN** the reviewer encounters something outside their persona's focus
- **THEN** the reviewer MAY:
  - Note it briefly for other reviewers
  - Flag it for discourse discussion
  - Pursue it if it impacts their area of expertise

---

### Requirement: Redundancy Aggregation

The system SHALL aggregate findings from redundant reviewer runs and assign confidence levels.

#### Scenario: Findings confirmed by redundancy
- **GIVEN** security reviewer ran with redundancy=2
- **WHEN** both security-1 and security-2 find the same issue
- **THEN** the finding SHALL be marked "Confirmed by redundancy" with very high confidence

#### Scenario: Single observation
- **GIVEN** security reviewer ran with redundancy=2
- **WHEN** only security-1 finds an issue (not security-2)
- **THEN** the finding SHALL be marked "Single observation" with lower confidence

---

### Requirement: Discourse Phase

The system SHALL facilitate a discourse phase where reviewers respond to each other's findings, unless `--quick` is specified.

#### Scenario: Discourse responses
- **GIVEN** all individual reviews are complete
- **WHEN** discourse phase runs
- **THEN** reviewers SHALL engage in natural discussion using:
  - AGREE: Endorse findings (increases confidence)
  - CHALLENGE: Push back with reasoning
  - CONNECT: Link findings across reviewers
  - SURFACE: Raise new concerns from discussion
- **AND** the discourse response types SHALL be fixed and not user-configurable

#### Scenario: Skip discourse
- **GIVEN** user specified `--quick` flag
- **WHEN** individual reviews complete
- **THEN** the system SHALL skip discourse and proceed to synthesis

---

### Requirement: Final Review Synthesis

The system SHALL synthesize individual reviews and discourse into a prioritized final review.

#### Scenario: Confidence weighting
- **GIVEN** findings from multiple sources
- **WHEN** synthesis occurs
- **THEN** findings SHALL be weighted by:
  1. Redundancy consensus (found by multiple runs)
  2. Cross-reviewer consensus (found by different reviewers)
  3. Discourse confirmation
  4. Severity

#### Scenario: Deduplication
- **GIVEN** the same issue found by multiple reviewers
- **WHEN** synthesis occurs
- **THEN** the issue SHALL appear once with sources noted

#### Scenario: Final review structure
- **GIVEN** synthesis is complete
- **WHEN** final review is generated
- **THEN** it SHALL include:
  - Summary
  - Verdict (APPROVE | REQUEST CHANGES | NEEDS DISCUSSION)
  - Must Fix (Critical/High severity)
  - Should Fix (Medium severity)
  - Consider (Low/Note severity)
  - What's Working Well
  - Discussion Notes
