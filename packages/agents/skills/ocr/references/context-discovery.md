# Context Discovery

Algorithm for building review context from OCR config, OpenSpec, and discovered files.

## Overview

Context discovery builds a comprehensive review context by:
1. Reading `.ocr/config.yaml` for project-specific context and rules
2. Pulling OpenSpec context and specs (if enabled)
3. Discovering referenced files (AGENTS.md, CLAUDE.md, etc.)
4. Merging everything with attribution

## Discovery Sources (Priority Order)

### Priority 1: OCR Config (Highest)

Direct context from `.ocr/config.yaml`:

```yaml
context: |
  Tech stack: TypeScript, React, Node.js
  Critical constraint: All public APIs must be backwards compatible

rules:
  critical:
    - Security vulnerabilities
    - Breaking changes without migration
```

### Priority 2: OpenSpec Integration

If `context_discovery.openspec.enabled: true`:

```
openspec/config.yaml       # Project conventions
openspec/specs/**/*.md     # Architectural specs
openspec/changes/**/*.md   # Active change proposals
```

### Priority 3: Reference Files

Files listed in `context_discovery.references`:

```
AGENTS.md
CLAUDE.md
.cursorrules
.windsurfrules
.github/copilot-instructions.md
CONTRIBUTING.md
```

### Priority 4: Additional Files

User-configured files in `context_discovery.additional`:

```
docs/ARCHITECTURE.md
docs/API_STANDARDS.md
```

## Discovery Algorithm

```python
def discover_context():
    config = read_yaml('.ocr/config.yaml')
    discovered = []
    
    # Priority 1: OCR config context
    if config.get('context'):
        discovered.append({
            'source': '.ocr/config.yaml (context)',
            'priority': 1,
            'content': config['context']
        })
    
    if config.get('rules'):
        discovered.append({
            'source': '.ocr/config.yaml (rules)',
            'priority': 1,
            'content': format_rules(config['rules'])
        })
    
    # Priority 2: OpenSpec
    openspec = config.get('context_discovery', {}).get('openspec', {})
    if openspec.get('enabled', True):
        if exists('openspec/config.yaml'):
            os_config = read_yaml('openspec/config.yaml')
            if os_config.get('context'):
                discovered.append({
                    'source': 'openspec/config.yaml',
                    'priority': 2,
                    'content': os_config['context']
                })
        
        # Read specs for architectural context
        for spec in glob('openspec/specs/**/*.md'):
            discovered.append({
                'source': spec,
                'priority': 2,
                'content': read(spec)
            })
    
    # Priority 3: Reference files
    refs = config.get('context_discovery', {}).get('references', [])
    for file in refs:
        if exists(file):
            discovered.append({
                'source': file,
                'priority': 3,
                'content': read(file)
            })
    
    return merge_with_attribution(discovered)
```

## Shell Commands for Discovery

```bash
# Read OCR config
cat .ocr/config.yaml

# Check OpenSpec
cat openspec/config.yaml 2>/dev/null
find openspec/specs -name "*.md" -type f 2>/dev/null

# Check reference files
for f in AGENTS.md CLAUDE.md .cursorrules .windsurfrules CONTRIBUTING.md; do
    [ -f "$f" ] && cat "$f"
done
```

## Output Format

Save discovered context to session directory:

```
.ocr/sessions/{id}/discovered-standards.md
```

### Example Output

```markdown
# Discovered Project Standards

**Discovery Date**: 2024-01-15
**Sources Found**: 4

## From: .ocr/config.yaml (context)

Tech stack: TypeScript, React, Node.js
Critical constraint: All public APIs must be backwards compatible

---

## From: openspec/config.yaml

context: |
  Monorepo using NX 22
  ESM only, no CommonJS
  Testing: Jest with React Testing Library

---

## From: AGENTS.md

# Agent Instructions
...

---

## Review Rules (from .ocr/config.yaml)

### Critical
- Security vulnerabilities (injection, path traversal, secrets in code)
- Breaking changes without migration path

### Important
- Silent error handling (catch without action)
- Missing user-facing error messages
```

## No Context Found

If no config exists:

1. Use sensible defaults
2. Suggest configuration:
   ```
   💡 Tip: Run `ocr init` to create .ocr/config.yaml for project-specific review context.
   ```

## Performance

- Cache discovered context in session directory
- Reuse for all reviewers in same session
- Only re-discover on new session
