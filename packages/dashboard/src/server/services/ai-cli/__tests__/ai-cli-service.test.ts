import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  AiCliService,
  ClaudeCodeAdapter,
  OpenCodeAdapter,
} from '../index.js'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('AiCliService', () => {
  it('uses a supplied startup preference without rereading project config', () => {
    vi.spyOn(ClaudeCodeAdapter.prototype, 'detect').mockReturnValue({ found: false })
    vi.spyOn(OpenCodeAdapter.prototype, 'detect').mockReturnValue({ found: false })

    const service = new AiCliService('/nonexistent/.ocr', 'off')

    expect(service.getStatus().preferred).toBe('off')
  })
})
