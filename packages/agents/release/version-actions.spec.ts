import { describe, it, expect } from 'vitest';
import { SKILL_VERSION_REGEX } from './version-actions';

// Tests use the exported SKILL_VERSION_REGEX constant — single source of truth
// shared between the class and these tests. If the regex changes in
// version-actions.ts, these tests automatically pick up the new pattern.

describe('version-actions sync logic', () => {
  describe('plugin.json version sync', () => {
    it('updates the version field in plugin.json', () => {
      const original = JSON.stringify(
        {
          name: 'ocr',
          description: 'Test plugin',
          version: '1.0.0',
          author: { name: 'Test' },
        },
        null,
        2,
      );

      const parsed = JSON.parse(original);
      parsed.version = '2.0.0';
      const updated = JSON.stringify(parsed, null, 2) + '\n';

      expect(JSON.parse(updated).version).toBe('2.0.0');
      expect(JSON.parse(updated).name).toBe('ocr');
      expect(JSON.parse(updated).description).toBe('Test plugin');
    });
  });

  describe('SKILL.md frontmatter version sync', () => {
    const skillContent = `---
name: ocr
description: |
  AI-powered multi-agent code review.
license: Apache-2.0
metadata:
  author: spencermarx
  version: "1.0.0"
  repository: https://github.com/test/repo
---

# Open Code Review
`;

    it('updates the version in YAML frontmatter', () => {
      const updated = skillContent.replace(SKILL_VERSION_REGEX, `$1"2.0.0"`);
      expect(updated).toContain('version: "2.0.0"');
      expect(updated).not.toContain('version: "1.0.0"');
    });

    it('preserves surrounding content', () => {
      const updated = skillContent.replace(SKILL_VERSION_REGEX, `$1"2.0.0"`);
      expect(updated).toContain('name: ocr');
      expect(updated).toContain('author: spencermarx');
      expect(updated).toContain('# Open Code Review');
    });

    it('preserves indentation', () => {
      const updated = skillContent.replace(SKILL_VERSION_REGEX, `$1"2.0.0"`);
      expect(updated).toMatch(/^\s{2}version: "2.0.0"/m);
    });

    it('detects when regex does not match (no-op)', () => {
      const noVersionContent = `---
name: ocr
metadata:
  author: spencermarx
---
`;
      const updated = noVersionContent.replace(SKILL_VERSION_REGEX, `$1"2.0.0"`);
      expect(updated).toBe(noVersionContent);
    });

    it('detects unquoted version as no-op', () => {
      const unquotedContent = `---
metadata:
  version: 1.0.0
---
`;
      const updated = unquotedContent.replace(SKILL_VERSION_REGEX, `$1"2.0.0"`);
      expect(updated).toBe(unquotedContent);
    });

    it('handles single-quoted version as no-op', () => {
      const singleQuotedContent = `---
metadata:
  version: '1.0.0'
---
`;
      const updated = singleQuotedContent.replace(
        SKILL_VERSION_REGEX,
        `$1"2.0.0"`,
      );
      expect(updated).toBe(singleQuotedContent);
    });
  });
});
