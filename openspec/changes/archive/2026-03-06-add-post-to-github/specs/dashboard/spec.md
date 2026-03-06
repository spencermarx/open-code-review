## ADDED Requirements

### Requirement: Post Review to GitHub

The dashboard SHALL allow posting a review round's final synthesis to GitHub as a PR comment from the round detail page, using the GitHub CLI (`gh`).

#### Scenario: Check GitHub auth and PR detection

- **GIVEN** the user clicks "Post to GitHub" on a review round page
- **WHEN** the client emits a `post:check-gh` Socket.IO event with the session ID
- **THEN** the server checks `gh auth status` and looks up the PR via `gh pr list --head <branch>`
- **AND** the server emits `post:gh-result` with `{ authenticated, prNumber, prUrl, branch }`

#### Scenario: Branch resolution for encoded names

- **GIVEN** the session branch is stored with hyphens (e.g. `feat-my-feature`)
- **WHEN** no PR is found for the literal branch name
- **THEN** the server SHALL try restoring common slash prefixes (e.g. `feat/my-feature`, `fix/my-feature`) and check each candidate
- **AND** the first matching PR is returned with the resolved branch name

#### Scenario: Post team review

- **GIVEN** GitHub auth is confirmed and a PR is detected
- **WHEN** the user chooses "Post Team Review"
- **THEN** the raw `final.md` content is submitted via `gh pr comment <prNumber> --body-file`
- **AND** a `post:submit-result` event is emitted with `{ success, commentUrl }`

#### Scenario: Successful post with comment URL

- **GIVEN** the review was posted successfully
- **WHEN** the `post:submit-result` event arrives with `success: true`
- **THEN** the dialog shows a success state with a clickable link to the GitHub comment

#### Scenario: GitHub CLI not authenticated

- **GIVEN** the user clicks "Post to GitHub"
- **WHEN** `gh auth status` fails
- **THEN** the dialog shows an error message instructing the user to run `gh auth login`

#### Scenario: No open PR found

- **GIVEN** GitHub auth succeeds
- **WHEN** no open PR matches the session branch (including slash-prefix candidates)
- **THEN** the dialog shows an error message indicating no PR was found for the branch

#### Scenario: Post submission failure

- **GIVEN** the user submits a review for posting
- **WHEN** `gh pr comment` fails
- **THEN** a `post:submit-result` event is emitted with `{ success: false, error }` and the dialog shows the error with a retry option

---

### Requirement: Human Review Translation

The dashboard SHALL allow users to generate a human-voice rewrite of the multi-reviewer synthesis using Claude CLI streaming, preview and edit the result, and save it as a draft before posting.

#### Scenario: Generate human review with streaming

- **GIVEN** GitHub auth is confirmed and a PR is detected
- **WHEN** the user chooses "Generate Human Review"
- **THEN** the server reads `final.md` and all reviewer output files for the round
- **AND** the server spawns Claude CLI with `--output-format stream-json --max-turns 1`
- **AND** text deltas are emitted as `post:token` events in real time
- **AND** the dialog displays the accumulating markdown content as it streams

#### Scenario: Tool status during generation

- **WHEN** Claude CLI uses tools (Read, Grep, Glob) during generation
- **THEN** the server emits `post:status` events with the tool name and a human-readable detail string
- **AND** the dialog displays the current tool activity in a status bar

#### Scenario: Preview and edit before posting

- **GIVEN** human review generation completes (server emits `post:done`)
- **WHEN** the dialog transitions to the preview step
- **THEN** the user can toggle between an edit view (textarea) and a rendered markdown preview
- **AND** the user can modify the generated content before posting

#### Scenario: Save draft as final-human.md

- **WHEN** the user clicks "Save Draft" in the preview step
- **THEN** the client emits a `post:save` event with the content
- **AND** the server writes the content to `final-human.md` in the session round directory
- **AND** FilesystemSync detects the file and stores it as a `final-human` artifact in SQLite

#### Scenario: Post human review

- **GIVEN** the user is in the preview step with generated or edited content
- **WHEN** the user clicks "Post to GitHub"
- **THEN** the content is submitted via `gh pr comment` the same as a team review post

#### Scenario: Cancel generation

- **WHEN** the user clicks "Cancel" during human review generation
- **THEN** the client emits a `post:cancel` event
- **AND** the server kills the Claude CLI process via SIGTERM
- **AND** the dialog returns to the ready step

#### Scenario: Generation error

- **WHEN** the Claude CLI process exits with a non-zero code
- **THEN** a `post:error` event is emitted with the error message
- **AND** the dialog transitions to an error step with a retry option

#### Scenario: Load existing human review draft

- **GIVEN** a `final-human.md` file exists for the round
- **WHEN** the user opens the round page
- **THEN** the `final-human` artifact is fetched and available for re-posting or editing

---

### Requirement: Human Review Prompt

The human review prompt SHALL produce a PR comment that reads as though a single human developer wrote it, following Google's code review guidelines for tone, with anti-AI writing instructions.

#### Scenario: Google code review tone

- **WHEN** the prompt is constructed
- **THEN** it SHALL instruct the model to comment on the code, never the developer
- **AND** it SHALL instruct the model to always explain why something matters
- **AND** it SHALL instruct the model to label severity naturally (e.g. prefix minor items with "Nit:" or "Minor:", flag blockers clearly)
- **AND** it SHALL instruct the model to acknowledge solid work briefly without over-praising

#### Scenario: Anti-AI writing instructions

- **WHEN** the prompt is constructed
- **THEN** it SHALL include instructions for sentence variety (mix short and long sentences, varied openers)
- **AND** it SHALL include a list of AI-typical words to avoid ("comprehensive", "robust", "leverage", "utilize", "furthermore", "additionally", "ensure", "facilitate")
- **AND** it SHALL instruct against the classic AI structure pattern (intro, numbered list, conclusion)
- **AND** it SHALL instruct the use of natural imperfections (dashes, parentheticals, contractions)

#### Scenario: Content preservation

- **WHEN** the prompt is constructed
- **THEN** it SHALL require preservation of every substantive technical finding from the source material
- **AND** it SHALL require inclusion of specific file paths and line numbers
- **AND** it SHALL require consolidation of duplicate findings from multiple reviewers
- **AND** it SHALL require stripping all meta-commentary about the review process

#### Scenario: Absolute prohibitions

- **WHEN** the prompt is constructed
- **THEN** it SHALL prohibit any mention of multiple reviewers, AI, agents, automated analysis, or tools
- **AND** it SHALL prohibit formulaic sign-offs or summary conclusion paragraphs
- **AND** the output format SHALL be GitHub-flavored markdown only, with no meta-preamble

---

### Requirement: Post Review State Machine

The dashboard client SHALL manage the post-to-GitHub flow through a deterministic state machine exposed as a React hook.

#### Scenario: State transitions

- **GIVEN** the hook is initialized
- **THEN** the state machine SHALL support the following steps: `idle`, `checking`, `ready`, `generating`, `preview`, `posting`, `posted`, `error`
- **AND** each step SHALL be a value of the `PostReviewStep` discriminated union type

#### Scenario: Reset to idle

- **WHEN** the user closes the dialog or clicks "Done"
- **THEN** the state machine resets to `idle` and clears all intermediate state (check result, streaming content, generated content, tool status, post result, error)
