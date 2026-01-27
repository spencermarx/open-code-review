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
{openspec.config}          # Project conventions (configurable path)
openspec/specs/**/*.md     # Architectural specs
openspec/changes/**/*.md   # Active change proposals
```

**Note**: The `config` path supports both `.yaml` (extracts `context` field) and `.md` files (uses entire content). Legacy projects can set `config: "openspec/project.md"`.

### Priority 3: Reference Files

Files listed in `context_discovery.references`:

```
AGENTS.md
CLAUDE.md
.cursorrules
.windsurfrules
.github/copilot-instructions.md
CONTRIBUTING.md
openspec/AGENTS.md
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
        config_path = openspec.get('config', 'openspec/config.yaml')
        
        if exists(config_path):
            # Handle both .yaml and .md config files
            if config_path.endswith('.yaml'):
                os_config = read_yaml(config_path)
                os_context = os_config.get('context')
            else:
                os_context = read(config_path)  # .md uses entire content
            
            if os_context:
                discovered.append({
                    'source': config_path,
                    'priority': 2,
                    'content': os_context
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

# Check OpenSpec (read config path from .ocr/config.yaml)
# Supports both .yaml (extracts context field) and .md (uses full content)
OPENSPEC_CONFIG=$(grep -A1 'openspec:' .ocr/config.yaml | grep 'config:' | awk '{print $2}' | tr -d '"')
cat "${OPENSPEC_CONFIG:-openspec/config.yaml}" 2>/dev/null
find openspec/specs -name "*.md" -type f 2>/dev/null

# Check reference files
for f in AGENTS.md CLAUDE.md .cursorrules .windsurfrules CONTRIBUTING.md; do
    [ -f "$f" ] && cat "$f"
done
```

## Output Format

Save discovered context to session directory (see `references/session-files.md` for authoritative file names):

```
.ocr/sessions/{YYYY-MM-DD}-{branch}/discovered-standards.md
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
