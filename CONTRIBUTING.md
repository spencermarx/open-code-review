# Contributing to Open Code Review

Thank you for your interest in contributing to Open Code Review! We welcome contributions from the community and are excited to have you on board.

## 🚀 Quick Start

1. **Fork the repository** and clone your fork
2. **Install dependencies**: `pnpm install`
3. **Run the CLI locally**: `nx run cli:init` or `nx run cli:progress`

## 📋 Before You Start

### Use OCR to Review Your Own Changes

We practice what we preach! Before submitting a PR, use OCR to review your changes:

```bash
# Stage your changes
git add .

# Run OCR review on your changes
/ocr-review

# Or use the CLI
npx @open-code-review/cli progress
```

This helps you:
- Catch issues before review
- Ensure your changes align with project standards
- Get multi-perspective feedback (architecture, quality, security, testing)

## 🔄 Contribution Workflow

### 1. Find or Create an Issue

- Check [existing issues](https://github.com/open-code-review/open-code-review/issues) first
- For new features, open a discussion before coding
- For bugs, include reproduction steps

### 2. Create a Branch

```bash
git checkout -b feature/your-feature-name
# or
git checkout -b fix/issue-description
```

### 3. Make Your Changes

- Follow the existing code style (TypeScript strict, ESM)
- Update documentation if needed
- Add tests for new functionality

### 4. Self-Review with OCR

```bash
# Review your staged changes
git add .
/ocr-review

# Address any findings before submitting
```

### 5. Submit a Pull Request

- Use a clear, descriptive title
- Reference related issues
- Include a summary of changes
- Attach your OCR review findings (optional but appreciated)

## 📁 Project Structure

```
open-code-review/
├── packages/
│   ├── agents/          # Skills, commands, reviewer personas
│   │   ├── commands/    # Slash command definitions
│   │   └── skills/ocr/  # Core OCR skill and references
│   └── cli/             # TypeScript CLI
│       └── src/
│           ├── commands/  # init, update, progress
│           └── lib/       # Shared utilities
├── openspec/            # Project specifications
│   ├── changes/         # Active change proposals
│   └── config.yaml      # Project context
└── .ocr/                # Installed OCR (gitignored sessions)
```

## 🧪 Testing

```bash
# Type check
pnpm exec tsc --noEmit

# Run tests (when available)
pnpm test

# Build CLI
nx run cli:build
```

## 📝 Code Style

- **TypeScript**: Strict mode, ESM only
- **Formatting**: Prettier (if configured)
- **Naming**: camelCase for variables/functions, PascalCase for types
- **Comments**: Only where they add value (avoid obvious comments)

## 🎯 Areas to Contribute

### Good First Issues

- Documentation improvements
- Additional reviewer personas
- CLI UX enhancements

### Feature Ideas

- New reviewer types (e.g., Performance, Accessibility)
- IDE integrations
- GitHub Actions integration
- Slack/Discord notifications

### Bug Fixes

- Check the issue tracker for `bug` labels

## 📖 Documentation

When adding features:
- Update relevant `.md` files in `packages/agents/`
- Keep `.ocr/` and `packages/agents/` in sync
- Update `README.md` if user-facing behavior changes

## 🤝 Code of Conduct

Be respectful, inclusive, and constructive. We're all here to build something useful together.

## ❓ Questions?

- Open a [GitHub Discussion](https://github.com/open-code-review/open-code-review/discussions)
- Check existing issues and docs first

---

**Thank you for contributing!** Every contribution, no matter how small, helps make OCR better for everyone.
