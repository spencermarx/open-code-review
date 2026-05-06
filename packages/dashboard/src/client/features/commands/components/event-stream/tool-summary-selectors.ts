/**
 * Tool inline-summary selectors.
 *
 * Each tool has one (or two) "load-bearing" arguments — the bit of input
 * that, at a glance, tells the user what the tool is doing. The renderer
 * uses these summaries inline next to the tool name so a collapsed tool
 * row reads as `🔧 Read · src/db/migrations.ts ✓` rather than dumping the
 * full input JSON.
 *
 * The `name` matched is the tool name as the adapter emits it — Claude
 * uses PascalCase, OpenCode is normalized to PascalCase by the adapter.
 *
 * Always returns a string. Never throws — if the input shape is unexpected
 * we fall back to a truncated stringification so the caller can still
 * render something readable.
 */

const MAX_SUMMARY_LEN = 80
const MAX_TASK_PROMPT_LEN = 60

function truncate(s: string, max = MAX_SUMMARY_LEN): string {
  if (s.length <= max) return s
  return s.slice(0, max - 1) + '…'
}

function stringInput(input: Record<string, unknown>, key: string): string | null {
  const v = input[key]
  return typeof v === 'string' ? v : null
}

/**
 * Returns the inline summary for a tool call, or null if the tool isn't
 * specifically handled (caller falls back to a generic JSON preview).
 */
export function selectToolSummary(
  name: string,
  input: Record<string, unknown>,
): string | null {
  switch (name) {
    case 'Read':
    case 'Edit':
    case 'Write':
    case 'NotebookEdit': {
      const path = stringInput(input, 'file_path') ?? stringInput(input, 'path')
      return path ?? null
    }
    case 'Bash': {
      const cmd = stringInput(input, 'command')
      if (!cmd) return null
      // Strip a leading `cd /long/path && ` — the cwd is implied.
      const stripped = cmd.replace(/^cd\s+\S+\s*&&\s*/, '')
      return truncate(stripped)
    }
    case 'Grep': {
      const pattern = stringInput(input, 'pattern')
      const glob = stringInput(input, 'glob')
      if (!pattern) return null
      return glob ? `${pattern} · ${glob}` : pattern
    }
    case 'Glob': {
      const pattern = stringInput(input, 'pattern')
      return pattern
    }
    case 'WebFetch': {
      return stringInput(input, 'url')
    }
    case 'WebSearch': {
      const query = stringInput(input, 'query')
      return query ? truncate(query) : null
    }
    case 'Task': {
      const subagentType = stringInput(input, 'subagent_type')
      const prompt = stringInput(input, 'prompt') ?? stringInput(input, 'description')
      const promptPreview = prompt ? truncate(prompt, MAX_TASK_PROMPT_LEN) : null
      if (subagentType && promptPreview) return `${subagentType} · ${promptPreview}`
      return subagentType ?? promptPreview ?? null
    }
    case 'TodoWrite': {
      const todos = input['todos']
      if (Array.isArray(todos)) return `${todos.length} todos`
      return null
    }
    default:
      return null
  }
}

/**
 * Fallback summary when no tool-specific selector matches.
 * Stringifies the input and truncates so the user gets *something*.
 */
export function selectToolSummaryFallback(input: Record<string, unknown>): string {
  try {
    const json = JSON.stringify(input)
    return truncate(json, MAX_SUMMARY_LEN)
  } catch {
    return ''
  }
}
