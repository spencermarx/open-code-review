import { afterEach, describe, expect, it, vi } from 'vitest'
import { AiCliService, ClaudeCodeAdapter, OpenCodeAdapter } from '../index.js'

afterEach(() => {
  vi.restoreAllMocks()
})

// Pins the startup wiring contract: the server parses dashboard config once
// and hands the preference in; the service does not re-read project config
// when a preference is supplied (the fallback read exists only for direct
// construction in tests/tooling).
describe('AiCliService', () => {
  it('uses a supplied startup preference without rereading project config', () => {
    vi.spyOn(ClaudeCodeAdapter.prototype, 'detect').mockReturnValue({ found: false })
    vi.spyOn(OpenCodeAdapter.prototype, 'detect').mockReturnValue({ found: false })

    const service = new AiCliService('/nonexistent/.ocr', 'off')

    expect(service.getStatus().preferred).toBe('off')
  })

  it('falls back to reading config when no preference is supplied', () => {
    vi.spyOn(ClaudeCodeAdapter.prototype, 'detect').mockReturnValue({ found: false })
    vi.spyOn(OpenCodeAdapter.prototype, 'detect').mockReturnValue({ found: false })

    // Nonexistent dir → shared config layer returns the 'auto' default.
    const service = new AiCliService('/nonexistent/.ocr')

    expect(service.getStatus().preferred).toBe('auto')
  })
})
