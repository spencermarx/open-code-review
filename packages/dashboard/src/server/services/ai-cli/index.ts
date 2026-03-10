/**
 * AI CLI Strategy Service.
 *
 * Uses the Strategy + Adapter pattern to abstract AI CLI execution:
 * - **Adapter**: Each CLI (Claude Code, OpenCode) implements `AiCliAdapter`
 *   to normalize spawn mechanics and output parsing.
 * - **Strategy**: This service selects the active adapter at startup based
 *   on binary detection + user config preference (`dashboard.ai_cli`).
 *
 * Consumers (command-runner, chat-handler, post-handler) call
 * `service.getAdapter()` to get the active strategy, then delegate
 * spawn/parse calls to it — never touching CLI binaries directly.
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { AiCliAdapter, AiCliStatus, DetectionResult } from './types.js'
import { ClaudeCodeAdapter } from './claude-adapter.js'
import { OpenCodeAdapter } from './opencode-adapter.js'

// Re-export everything consumers need
export type { AiCliAdapter, AiCliStatus, NormalizedEvent, SpawnOptions, SpawnResult, SpawnMode } from './types.js'
export { formatToolDetail, extractAssistantText, writeTempPrompt, cleanupTempFile } from './helpers.js'
export { ClaudeCodeAdapter } from './claude-adapter.js'
export { OpenCodeAdapter } from './opencode-adapter.js'

type AiCliPreference = 'auto' | 'claude' | 'opencode' | 'off'

type AdapterEntry = {
  adapter: AiCliAdapter
  detection: DetectionResult
}

/**
 * Read `dashboard.ai_cli` from `.ocr/config.yaml`.
 * Falls back to 'auto' if the field is missing or the file doesn't exist.
 */
function readAiCliPreference(ocrDir: string): AiCliPreference {
  try {
    const configPath = join(ocrDir, 'config.yaml')
    const content = readFileSync(configPath, 'utf-8')
    const match = content.match(/^\s*ai_cli:\s*(\S+)/m)
    const value = match?.[1] ?? 'auto'
    if (value === 'claude' || value === 'opencode' || value === 'off') return value
    return 'auto'
  } catch {
    return 'auto'
  }
}

export class AiCliService {
  private readonly entries: AdapterEntry[]
  private readonly activeAdapter: AiCliAdapter | null
  private readonly preference: AiCliPreference
  private readonly status: AiCliStatus

  constructor(ocrDir: string) {
    this.preference = readAiCliPreference(ocrDir)

    // Register all known adapters and run detection
    const adapters: AiCliAdapter[] = [
      new ClaudeCodeAdapter(),
      new OpenCodeAdapter(),
    ]

    this.entries = adapters.map((adapter) => ({
      adapter,
      detection: adapter.detect(),
    }))

    // Select active adapter based on preference
    this.activeAdapter = this.selectAdapter()

    // Build status for /api/config
    this.status = {
      available: this.entries
        .filter((e) => e.detection.found)
        .map((e) => e.adapter.binary),
      active: this.activeAdapter?.binary ?? null,
      preferred: this.preference,
    }

    // Log detection results
    const detected = this.entries
      .filter((e) => e.detection.found)
      .map((e) => `${e.adapter.name} v${e.detection.version ?? '?'}`)
    if (detected.length > 0) {
      console.log(`  AI CLI detected:   ${detected.join(', ')}`)
    }
    if (this.preference === 'off') {
      console.log('  AI CLI active:     off (read-only mode)')
    } else if (this.activeAdapter) {
      console.log(`  AI CLI active:     ${this.activeAdapter.name} (${this.preference})`)
    } else {
      console.log('  AI CLI active:     none (read-only mode)')
    }
  }

  /** Returns the status object for the /api/config endpoint. */
  getStatus(): AiCliStatus {
    return this.status
  }

  /** Returns the active adapter, or null if no AI CLI is available. */
  getAdapter(): AiCliAdapter | null {
    return this.activeAdapter
  }

  /** Whether any AI CLI is available for command execution. */
  isAvailable(): boolean {
    return this.activeAdapter !== null
  }

  /** Returns detection results for all registered adapters. */
  getDetectionResults(): Array<{ name: string; binary: string; detection: DetectionResult }> {
    return this.entries.map((e) => ({
      name: e.adapter.name,
      binary: e.adapter.binary,
      detection: e.detection,
    }))
  }

  // ── Private ──

  private selectAdapter(): AiCliAdapter | null {
    // User explicitly disabled AI CLI
    if (this.preference === 'off') return null

    const available = this.entries.filter((e) => e.detection.found)
    if (available.length === 0) return null

    // Explicit preference
    if (this.preference !== 'auto') {
      const preferred = available.find((e) => e.adapter.binary === this.preference)
      if (preferred) return preferred.adapter
      // Preference not available — fall through to auto
      console.warn(
        `  AI CLI: Preferred "${this.preference}" not found, falling back to auto-detection`,
      )
    }

    // Auto: prefer Claude Code (established, fully implemented adapter)
    const claude = available.find((e) => e.adapter.binary === 'claude')
    if (claude) return claude.adapter

    // Otherwise use first available
    return available[0]?.adapter ?? null
  }
}
