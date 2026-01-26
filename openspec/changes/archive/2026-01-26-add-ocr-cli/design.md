# Design: OCR CLI

## Context

OCR currently requires manual installation via git clone and file copying. Users need a streamlined CLI that:
1. Sets up OCR for multiple AI coding environments
2. Provides real-time visibility into ongoing code reviews

The CLI must be publishable to npm and executable via `npx`/`pnpm dlx`.

## Goals / Non-Goals

**Goals:**
- NX 22 integrated monorepo with two publishable packages
- Standard npm distribution (`npx @open-code-review/cli`)
- Multi-environment `init` command with interactive selection
- Real-time `progress` command for review tracking
- Strict TypeScript with zero `any` tolerance
- AGENTS.md/CLAUDE.md injection during init (following OpenSpec pattern)

**Non-Goals:**
- Programmatic API (CLI only for now)
- CI/CD automation commands (future scope)

---

## Decision 1: NX 22 Integrated Monorepo Architecture

**Decision:** Use NX 22 with two publishable packages: `@open-code-review/cli` and `@open-code-review/agents`.

**Why:**
- NX provides battle-tested monorepo tooling with task caching
- Separation of concerns: CLI logic vs agentic assets
- `@open-code-review/agents` can be used independently by other tools
- `nx release` for automated versioning and publishing
- Inferred tasks reduce configuration overhead

**Alternatives Considered:**
- **Single package (Vite)**: Simpler but mixes concerns, harder to maintain assets separately
- **tsup/unbuild**: Good options but lacks monorepo benefits
- **Bun-only build**: Less mature npm publishing story

**Structure:**
```
open-code-review/
├── packages/
│   ├── cli/                           # @open-code-review/cli
│   │   ├── src/
│   │   │   ├── index.ts               # CLI entry with shebang
│   │   │   ├── commands/
│   │   │   │   ├── init.ts            # ocr init
│   │   │   │   ├── update.ts          # ocr update
│   │   │   │   └── progress.ts        # ocr progress
│   │   │   └── lib/
│   │   │       ├── config.ts          # AI tools config
│   │   │       ├── installer.ts       # File copy
│   │   │       ├── injector.ts        # AGENTS.md/CLAUDE.md injection
│   │   │       └── watcher.ts         # Session file watcher
│   │   ├── package.json
│   │   ├── project.json               # NX project config
│   │   └── tsconfig.json
│   │
│   └── agents/                        # @open-code-review/agents
│       ├── skills/
│       │   └── ocr/
│       │       ├── SKILL.md           # Core skill definition
│       │       ├── AGENTS.md          # OCR-specific agent instructions
│       │       ├── assets/
│       │       │   ├── config.yaml    # Config template (installed to .ocr/)
│       │       │   └── reviewer-template.md
│       │       └── references/
│       │           ├── workflow.md
│       │           ├── synthesis.md
│       │           ├── discourse.md
│       │           └── reviewers/
│       │               ├── principal.md
│       │               ├── quality.md
│       │               ├── security.md
│       │               └── testing.md
│       ├── commands/                  # Slash command definitions
│       │   ├── review.md
│       │   ├── doctor.md
│       │   ├── reviewers.md
│       │   ├── history.md
│       │   ├── show.md
│       │   └── post.md
│       ├── package.json
│       └── project.json
│
├── nx.json                            # NX workspace config
├── package.json                       # Root workspace
├── pnpm-workspace.yaml                # pnpm workspace
└── tsconfig.base.json                 # Shared TS config
```

---

## Decision 2: CLI Framework

**Decision:** Use Commander.js for CLI parsing and Inquirer for prompts.

**Why:**
- Commander is the de-facto standard for Node CLIs
- Inquirer provides rich interactive prompts (checkbox, select)
- Both have excellent TypeScript support
- Matches OpenSpec CLI patterns

**Dependencies:**
```json
{
  "dependencies": {
    "commander": "^13.0.0",
    "@inquirer/prompts": "^7.0.0",
    "chalk": "^5.0.0",
    "ora": "^8.0.0",
    "chokidar": "^4.0.0"
  }
}
```

---

## Decision 3: Init Command Design

**Decision:** Support both interactive multi-select and non-interactive `--tools` flag.

**Interactive Mode:**
```
$ ocr init

  Open Code Review

  AI-powered multi-agent code review

? Select AI tools to configure (space to select, enter to confirm)
  ◉ Claude Code (configured)
  ◯ Cursor
  ◉ Windsurf (configured)
  ◯ GitHub Copilot
  ...
```

**Non-Interactive Mode:**
```bash
ocr init --tools claude,cursor,windsurf
ocr init --tools all
```

**Installation Strategy:**
- **Inside OCR repo**: Use symlinks (stays in sync with updates)
- **External project**: Copy files (standalone installation)

---

## Decision 4: Progress Command Design

**Decision:** Real-time file-based progress tracking via `.ocr/sessions/` directory watching.

**Why:**
- OCR stores all state in markdown files under `.ocr/sessions/`
- No need for IPC or sockets—just watch the filesystem
- Works with any AI tool (Claude, Cursor, Windsurf, etc.)

**Tracked Events:**
| File Pattern | Event |
|--------------|-------|
| `context.md` created | Review started |
| `reviews/{reviewer}.md` created | Reviewer started |
| `reviews/{reviewer}.md` updated | Reviewer progress |
| `discourse.md` created | Discourse phase started |
| `discourse.md` updated | Discourse progress |
| `final.md` created | Review complete |

**Output Format:**
```
$ ocr progress

  Open Code Review - Live Progress
  Session: 2025-01-26-feature/add-auth

  ┌─────────────────────────────────────────────────────────┐
  │ Phase: Discourse                                        │
  ├─────────────────────────────────────────────────────────┤
  │ ✓ Context Discovery          00:03                     │
  │ ✓ Principal (architecture)   00:45  3 findings         │
  │ ✓ Security                   01:12  5 findings         │
  │ ✓ Quality                    00:38  2 findings         │
  │ ◐ Discourse                  00:22  2 exchanges        │
  │ ○ Final Synthesis            --:--                     │
  └─────────────────────────────────────────────────────────┘

  Press Ctrl+C to exit
```

---

## Decision 5: TypeScript Standards

**Decision:** Strict TypeScript with zero tolerance for unsafe patterns.

Added to `openspec/project.md`:

| Forbidden | Use Instead |
|-----------|-------------|
| `any` | Proper types, `unknown`, generics |
| `as T` | Type guards, inference |
| `!` | Null checks, optional chaining |
| `@ts-ignore` | Fix the type error |

**Key Patterns:**
- Prefer `type` over `interface`
- Use discriminated unions for state
- Exhaustive switch with `never` default
- Branded types for ID safety

---

## Decision 6: Package Publishing with NX Release

**Decision:** Use `nx release` for coordinated versioning and publishing of both packages.

**CLI Package.json (`packages/cli/package.json`):**
```json
{
  "name": "@open-code-review/cli",
  "version": "1.0.0",
  "type": "module",
  "bin": {
    "ocr": "./dist/index.js"
  },
  "files": ["dist"],
  "dependencies": {
    "@open-code-review/agents": "workspace:*",
    "commander": "^13.0.0",
    "@inquirer/prompts": "^7.0.0",
    "chalk": "^5.0.0",
    "ora": "^8.0.0",
    "chokidar": "^4.0.0"
  },
  "engines": {
    "node": ">=20.0.0"
  },
  "publishConfig": {
    "access": "public"
  }
}
```

**Agents Package.json (`packages/agents/package.json`):**

The agents package contains only static assets (markdown, YAML) — no build step required.

```json
{
  "name": "@open-code-review/agents",
  "version": "1.0.0",
  "type": "module",
  "files": ["ocr", "commands"],
  "publishConfig": {
    "access": "public"
  }
}
```

**NX Release Config (`nx.json`):**
```json
{
  "release": {
    "projects": ["packages/*"],
    "version": {
      "conventionalCommits": true
    },
    "changelog": {
      "projectChangelogs": true
    }
  }
}
```

**Publishing:**
```bash
nx release --dry-run        # Preview
nx release                  # Version + changelog + publish
```

---

## Decision 7: esbuild Bundler for CLI

**Decision:** Use esbuild via `@nx/esbuild` for CLI bundling with shebang injection.

**Why:**
- Extremely fast build times (~50ms)
- Native support for bundling Node.js CLIs
- Easy shebang injection via banner option
- Tree-shaking for minimal bundle size

**NX Project Config (`packages/cli/project.json`):**
```json
{
  "name": "cli",
  "targets": {
    "build": {
      "executor": "@nx/esbuild:esbuild",
      "options": {
        "main": "packages/cli/src/index.ts",
        "outputPath": "packages/cli/dist",
        "outputFileName": "index.js",
        "format": ["esm"],
        "platform": "node",
        "target": "node20",
        "bundle": true,
        "minify": false,
        "esbuildOptions": {
          "banner": {
            "js": "#!/usr/bin/env node"
          }
        }
      }
    }
  }
}
```

---

## Decision 8: AGENTS.md/CLAUDE.md Injection

**Decision:** During `ocr init`, inject a managed block into the user's `AGENTS.md` and `CLAUDE.md` files (following the OpenSpec pattern).

**Why:**
- Ensures AI assistants know to reference `.ocr/AGENTS.md` for code review tasks
- Follows established pattern from OpenSpec
- Non-destructive: uses managed blocks that can be updated

**Injected Block:**
```markdown
<!-- OCR:START -->
# Open Code Review Instructions

These instructions are for AI assistants handling code review in this project.

Always open `.ocr/AGENTS.md` when the request:
- Asks for code review, PR review, or feedback on changes
- Mentions "review my code" or similar phrases
- Wants multi-perspective analysis of code quality

Use `.ocr/AGENTS.md` to learn:
- How to run the 8-phase review workflow
- Available reviewer personas and their focus areas
- Session management and output format

Keep this managed block so 'ocr init' can refresh the instructions.

<!-- OCR:END -->
```

**Implementation:**
```typescript
// packages/cli/src/lib/injector.ts
export function injectOcrInstructions(filePath: string): void {
  const START_MARKER = '<!-- OCR:START -->';
  const END_MARKER = '<!-- OCR:END -->';
  
  let content = existsSync(filePath) ? readFileSync(filePath, 'utf-8') : '';
  
  // Remove existing block if present
  const regex = new RegExp(`${START_MARKER}[\\s\\S]*?${END_MARKER}\\n?`, 'g');
  content = content.replace(regex, '');
  
  // Append new block
  content = content.trim() + '\n\n' + OCR_INSTRUCTION_BLOCK + '\n';
  
  writeFileSync(filePath, content);
}
```

---

## Decision 9: NX Dev Commands for Local Development

**Decision:** Define custom NX targets in `project.json` to provide a friendly local development experience via `nx run cli:<command>`.

**Why:**
- Eliminates need to build before testing CLI commands
- Uses `tsx` for fast TypeScript execution during development
- Consistent with NX workflow patterns
- Enables passing arguments via `-- --tools claude`

**NX Project Config (`packages/cli/project.json`):**
```json
{
  "name": "cli",
  "targets": {
    "build": {
      "executor": "@nx/esbuild:esbuild",
      "options": {
        "main": "packages/cli/src/index.ts",
        "outputPath": "packages/cli/dist",
        "outputFileName": "index.js",
        "format": ["esm"],
        "platform": "node",
        "target": "node20",
        "bundle": true,
        "minify": false,
        "esbuildOptions": {
          "banner": {
            "js": "#!/usr/bin/env node"
          }
        }
      }
    },
    "dev": {
      "executor": "nx:run-commands",
      "options": {
        "command": "tsx packages/cli/src/index.ts",
        "cwd": "{workspaceRoot}"
      }
    },
    "init": {
      "executor": "nx:run-commands",
      "options": {
        "command": "tsx packages/cli/src/index.ts init",
        "cwd": "{workspaceRoot}"
      }
    },
    "progress": {
      "executor": "nx:run-commands",
      "options": {
        "command": "tsx packages/cli/src/index.ts progress",
        "cwd": "{workspaceRoot}"
      }
    }
  }
}
```

**Usage:**
```bash
# Run any CLI command during development
nx run cli:dev -- --help
nx run cli:init -- --tools claude,windsurf
nx run cli:init -- --tools all --no-inject
nx run cli:progress -- --session 2025-01-26-main

# Shorthand (when target name is unique)
nx init cli -- --tools claude
nx progress cli
```

**Dev Dependencies:**
```json
{
  "devDependencies": {
    "tsx": "^4.0.0"
  }
}
```

---

## Risks / Trade-offs

| Risk | Mitigation |
|------|------------|
| File watching performance | Use chokidar with debouncing |
| Cross-platform paths | Use `node:path` consistently |
| npm scope availability | `@open-code-review` is available |
| AGENTS.md injection conflicts | Use managed blocks with clear markers |
| Package interdependency | `workspace:*` for local dev, proper versioning for publish |

---

## Open Questions

None—ready for implementation.
