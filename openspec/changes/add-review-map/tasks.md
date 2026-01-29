# Tasks: Add Code Review Map

## 1. Foundation

- [x] 1.1 Create `review-map` spec with core requirements
- [x] 1.2 Add `/ocr:map` command spec delta to `slash-commands`
- [x] 1.3 Add map session artifacts spec delta to `session-management`
- [x] 1.4 Validate specs with `openspec validate add-review-map --strict`

## 2. Agent Personas

- [x] 2.1 Create Map Architect persona (`references/map-personas/architect.md`)
- [x] 2.2 Create Flow Analyst persona (`references/map-personas/flow-analyst.md`)
- [x] 2.3 Create Requirements Mapper persona (`references/map-personas/requirements-mapper.md`)

## 3. Workflow Implementation

- [x] 3.1 Create map workflow reference (`references/map-workflow.md`)
- [x] 3.2 Define Phase 1: Context Discovery (shared with review, includes upstream/downstream tracing)
- [x] 3.3 Define Phase 2: Topology Analysis (Map Architect)
- [x] 3.4 Define Phase 3: Flow Tracing (Flow Analysts with redundancy)
- [x] 3.5 Define Phase 4: Requirements Mapping (if requirements provided)
- [x] 3.6 Define Phase 5: Map Synthesis with completeness validation
- [x] 3.7 Define Phase 6: Present

## 4. Output Templates

- [x] 4.1 Create map output template (`references/map-template.md`)
- [x] 4.2 Define section format with checkboxes
- [x] 4.3 Define file index format
- [x] 4.4 Define overview/summary format

## 5. Command Implementation

- [x] 5.1 Create `/ocr:map` command file (`commands/map.md`)
- [x] 5.2 Implement command argument parsing (target, requirements, etc.)
- [x] 5.3 Add Windsurf workflow (`/ocr-map`)

## 6. Session Integration

- [x] 6.1 Define map artifact storage with runs structure (`map/runs/run-{n}/`)
- [x] 6.2 Update state.json schema for map phases and `current_map_run`
- [x] 6.3 Implement map run tracking (parallel to review rounds)
- [ ] 6.4 Add `--map` and `--run` flags to `/ocr:show` command

## 7. Validation & Testing

- [x] 7.1 Add completeness validation step to workflow
- [ ] 7.2 Test with small change set (< 5 files)
- [ ] 7.3 Test with medium change set (10-20 files)
- [ ] 7.4 Test with large change set (50+ files)
- [ ] 7.5 Verify all files appear in map output

## 8. Natural Language Map Reference

- [x] 8.1 Implement natural language detection for existing map references in review workflow
- [x] 8.2 Add logic for Tech Lead to check `map/` directory when user references a map
- [x] 8.3 Handle "map not found" case gracefully (inform user, proceed with standard review)

## 9. Configuration

- [x] 9.1 Add `code-review-map` section to config template
- [x] 9.2 Implement config parsing for `agents.flow_analysts` (default: 2, range: 1-10)
- [x] 9.3 Implement config parsing for `agents.requirements_mappers` (default: 2, range: 1-10)
- [x] 9.4 Add validation for out-of-range values with fallback to defaults
- [x] 9.5 Wire config values to agent spawning logic

## 10. Documentation

- [x] 10.1 Update SKILL.md with map command reference
- [x] 10.2 Add map workflow to quick reference
- [x] 10.3 Document `code-review-map` config options

### 10.4 README Documentation (Positioning)

- [ ] 10.4.1 Add "Code Review Map" section to main README explaining:
  - Primary audience is humans — exhaustive output for last line of defense
  - Standalone `/ocr:map` command for changeset navigation
  - Map and review are orthogonal tools that complement each other
- [ ] 10.4.2 Document "When to Use Map":
  - Extremely large changesets (would take multiple hours for human review)
  - Need a navigation aid to track progress through many files
  - Want to understand structure before diving into details
- [ ] 10.4.3 Document "Why Review Alone is Usually Sufficient":
  - Tech Lead and reviewers already perform upstream/downstream investigation
  - Lighter-weight context gathering is token-efficient
  - Sufficient for the vast majority of changesets
  - Map uses additional redundant specialized agents — valuable for humans, typically overkill for AI
- [ ] 10.4.4 Add "Using Both Tools" subsection:
  - Run `/ocr:map` first for yourself as a human navigation aid
  - Run `/ocr:review` for AI feedback
  - Outputs complement each other for the human reviewer
  - Can reference existing map in review via natural language if desired
- [ ] 10.4.5 Add configuration examples for different scenarios:
  - Default config (2x redundancy)
  - Large codebase config (3-4x redundancy)
  - Speed-optimized config (1x, no redundancy)
- [ ] 10.5 Update packages/agents README with map agent personas
