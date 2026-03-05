/**
 * Socket.IO chat handler.
 *
 * Manages "Ask the Team" AI chat conversations by spawning Claude CLI
 * processes, streaming NDJSON responses as socket events, and persisting
 * messages to the database.
 */

import { spawn, type ChildProcess } from 'node:child_process'
import { writeFileSync, unlinkSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import type { Server as SocketIOServer, Socket } from 'socket.io'
import type { Database } from 'sql.js'
import {
  saveDb,
  getConversation,
  getMessages,
  insertMessage,
  upsertConversation,
  updateConversationClaudeSession,
  updateConversationStatus,
  type ChatConversationRow,
} from '../db.js'
import { buildChatContext, type ChatTarget } from '../services/chat-context.js'
import { cleanEnv } from './env.js'

// ── Types ──

interface ChatSendPayload {
  conversationId: string
  sessionId: string
  targetType: ChatConversationRow['target_type']
  targetId: number
  message: string
}

interface ChatHistoryPayload {
  conversationId: string
}

// ── Constants ──

/** Conversations expire after 48 hours of inactivity. */
const IDLE_TIMEOUT_MS = 48 * 60 * 60 * 1000

// ── Active processes ──

interface ActiveChat {
  process: ChildProcess | null
  conversationId: string
  timer: ReturnType<typeof setTimeout>
}

const activeChats = new Map<string, ActiveChat>()

/**
 * Clean up an active chat process and its idle timer.
 */
function cleanupChat(conversationId: string): void {
  const chat = activeChats.get(conversationId)
  if (chat) {
    clearTimeout(chat.timer)
    if (chat.process && !chat.process.killed) {
      chat.process.kill('SIGTERM')
    }
    activeChats.delete(conversationId)
  }
}

/**
 * Reset the idle timeout for a conversation.
 * Expires the conversation and kills the process after 48 hours.
 */
function resetIdleTimer(
  conversationId: string,
  db: Database,
  ocrDir: string
): void {
  const chat = activeChats.get(conversationId)
  if (chat) {
    clearTimeout(chat.timer)
    chat.timer = setTimeout(() => {
      updateConversationStatus(db, conversationId, 'expired')
      saveDb(db, ocrDir)
      cleanupChat(conversationId)
    }, IDLE_TIMEOUT_MS)
  }
}

/**
 * Format a tool_use block into a human-readable description.
 */
function formatToolDetail(tool: string, input: Record<string, unknown>): string {
  switch (tool) {
    case 'Read':
      return `Reading ${input['file_path'] ?? 'file'}`
    case 'Grep':
      return `Searching for "${input['pattern'] ?? '...'}"`
    case 'Glob':
      return `Finding files matching ${input['pattern'] ?? '...'}`
    default:
      return `Using ${tool}`
  }
}

/**
 * Extract the full concatenated text from an assistant message's content blocks.
 */
function extractFullText(parsed: Record<string, unknown>): string {
  const msg = parsed['message'] as Record<string, unknown> | undefined
  const content = msg?.['content'] as Array<Record<string, unknown>> | undefined
  if (!content) return ''

  let text = ''
  for (const block of content) {
    if (block['type'] === 'text' && typeof block['text'] === 'string') {
      text += block['text']
    }
  }
  return text
}

/**
 * Registers chat socket handlers for a connected client.
 */
export function registerChatHandlers(
  io: SocketIOServer,
  socket: Socket,
  db: Database,
  ocrDir: string
): void {
  socket.on('chat:send', (payload: ChatSendPayload) => {
    const { conversationId, sessionId, targetType, targetId, message } = payload

    if (!conversationId || !sessionId || !targetType || !message) {
      socket.emit('chat:error', {
        conversationId,
        error: 'Missing required fields: conversationId, sessionId, targetType, message',
      })
      return
    }

    // Ensure conversation exists in DB
    upsertConversation(db, conversationId, sessionId, targetType, targetId)
    saveDb(db, ocrDir)

    // Store user message
    insertMessage(db, conversationId, 'user', message)
    saveDb(db, ocrDir)

    // Check if conversation has a Claude session to resume
    const conversation = getConversation(db, conversationId)
    const claudeSessionId = conversation?.claude_session_id ?? null

    // Build CLI flags and prompt separately.
    // Prompt is written to a temp file then piped via `cat | claude` to avoid
    // both shell interpretation issues and argument length limits.
    const { flags, prompt } = buildCliInput(ocrDir, {
      message,
      sessionId,
      targetType,
      targetId,
      claudeSessionId,
    })

    // Write prompt to a temp file
    const tmpDir = join('/tmp', 'ocr-chat-prompts')
    try { mkdirSync(tmpDir, { recursive: true }) } catch { /* exists */ }
    const tmpFile = join(tmpDir, `${randomUUID()}.txt`)
    writeFileSync(tmpFile, prompt)

    // Build shell command: cat prompt | claude [flags]
    // Using cat pipe avoids argument escaping entirely — the prompt content
    // never touches the shell, only the temp file path does.
    const flagStr = flags.map((f) => `'${f.replace(/'/g, "'\\''")}'`).join(' ')
    const shellCmd = `cat '${tmpFile}' | claude ${flagStr}`

    const proc = spawn('sh', ['-c', shellCmd], {
      cwd: process.cwd(),
      env: cleanEnv(),
    })

    // Track the process
    const timer = setTimeout(() => {
      updateConversationStatus(db, conversationId, 'expired')
      saveDb(db, ocrDir)
      cleanupChat(conversationId)
    }, IDLE_TIMEOUT_MS)

    activeChats.set(conversationId, { process: proc, conversationId, timer })

    // Parse NDJSON stream for assistant text tokens and tool activity
    let assistantText = ''
    let lineBuffer = ''
    let capturedClaudeSessionId: string | null = null
    let thinkingStatusEmitted = false
    const emittedToolUseIds = new Set<string>()

    proc.stdout?.on('data', (chunk: Buffer) => {
      lineBuffer += chunk.toString()
      const lines = lineBuffer.split('\n')
      // Keep the last incomplete line in the buffer
      lineBuffer = lines.pop() ?? ''

      for (const line of lines) {
        if (!line.trim()) continue
        try {
          const parsed = JSON.parse(line) as Record<string, unknown>
          handleNdjsonLine(parsed)
        } catch {
          // Skip non-JSON lines
        }
      }
    })

    function handleNdjsonLine(parsed: Record<string, unknown>): void {
      const type = parsed['type'] as string | undefined

      // Capture session ID from init or result messages
      if (parsed['session_id']) {
        capturedClaudeSessionId = parsed['session_id'] as string
      }

      // Handle streaming events (from --include-partial-messages).
      // These arrive as individual deltas, not accumulated messages.
      if (type === 'stream_event') {
        const event = parsed['event'] as Record<string, unknown> | undefined
        if (!event) return
        const eventType = event['type'] as string | undefined

        // Text deltas — the actual response tokens
        if (eventType === 'content_block_delta') {
          const delta = event['delta'] as Record<string, unknown> | undefined
          const deltaType = delta?.['type'] as string | undefined

          if (deltaType === 'text_delta' && typeof delta?.['text'] === 'string') {
            const text = delta['text'] as string
            assistantText += text
            socket.emit('chat:token', { conversationId, token: text })
          }

          // Show "Thinking..." status during the thinking phase
          if (deltaType === 'thinking_delta' && !thinkingStatusEmitted) {
            thinkingStatusEmitted = true
            socket.emit('chat:status', {
              conversationId,
              tool: 'thinking',
              detail: 'Thinking...',
            })
          }
        }

        // Tool use blocks — agentic activity indicator
        if (eventType === 'content_block_start') {
          const block = event['content_block'] as Record<string, unknown> | undefined
          if (block?.['type'] === 'tool_use') {
            const toolId = block['id'] as string
            if (toolId && !emittedToolUseIds.has(toolId)) {
              emittedToolUseIds.add(toolId)
              const toolName = block['name'] as string
              const input = (block['input'] as Record<string, unknown>) ?? {}
              socket.emit('chat:status', {
                conversationId,
                tool: toolName,
                detail: formatToolDetail(toolName, input),
              })
            }
          }
        }
      }

      // Handle complete assistant messages (final text for DB storage).
      // These arrive after all stream_event deltas are done.
      if (type === 'assistant') {
        const fullText = extractFullText(parsed)
        if (fullText.length > 0) {
          assistantText = fullText
        }
      }
    }

    // Capture stderr for error reporting
    let stderrBuffer = ''
    proc.stderr?.on('data', (chunk: Buffer) => {
      stderrBuffer += chunk.toString()
    })

    proc.on('close', (code) => {
      // Clean up temp file
      try { unlinkSync(tmpFile) } catch { /* ignore */ }

      // Process any remaining buffered data
      if (lineBuffer.trim()) {
        try {
          const parsed = JSON.parse(lineBuffer) as Record<string, unknown>
          handleNdjsonLine(parsed)
        } catch {
          // Skip non-JSON remainder
        }
      }

      // Store Claude session ID for future resume
      if (capturedClaudeSessionId) {
        updateConversationClaudeSession(db, conversationId, capturedClaudeSessionId)
      }

      // Store assistant response
      if (assistantText.trim()) {
        insertMessage(db, conversationId, 'assistant', assistantText.trim())
      }
      saveDb(db, ocrDir)

      if (code === 0) {
        socket.emit('chat:done', { conversationId })
      } else {
        socket.emit('chat:error', {
          conversationId,
          error: stderrBuffer || `Claude process exited with code ${code}`,
        })
      }

      // Reset idle timer (keep entry for session tracking)
      resetIdleTimer(conversationId, db, ocrDir)
      // Remove process reference since it's done
      const chat = activeChats.get(conversationId)
      if (chat) {
        chat.process = null
      }
    })

    proc.on('error', (err) => {
      socket.emit('chat:error', {
        conversationId,
        error: `Failed to spawn Claude: ${err.message}`,
      })
      cleanupChat(conversationId)
    })
  })

  // Load conversation history
  socket.on('chat:history', (payload: ChatHistoryPayload) => {
    const { conversationId } = payload

    if (!conversationId) {
      socket.emit('chat:error', {
        conversationId: null,
        error: 'Missing conversationId',
      })
      return
    }

    const conversation = getConversation(db, conversationId)
    if (!conversation) {
      socket.emit('chat:history:result', {
        conversationId,
        conversation: null,
        messages: [],
      })
      return
    }

    const messages = getMessages(db, conversationId)
    socket.emit('chat:history:result', {
      conversationId,
      conversation,
      messages,
    })
  })
}

/**
 * Kill all active chat processes. Called during server shutdown.
 */
export function cleanupAllChats(): void {
  for (const conversationId of activeChats.keys()) {
    cleanupChat(conversationId)
  }
}

// ── Internal helpers ──

function buildCliInput(
  ocrDir: string,
  opts: {
    message: string
    sessionId: string
    targetType: ChatConversationRow['target_type']
    targetId: number
    claudeSessionId: string | null
  }
): { flags: string[]; prompt: string } {
  const flags = [
    '--print',
    '--output-format', 'stream-json',
    '--verbose',
    '--include-partial-messages',
    '--max-turns', '1',
    '--allowedTools', 'Read,Grep,Glob',
  ]

  if (opts.claudeSessionId) {
    flags.push('--resume', opts.claudeSessionId)
    return { flags, prompt: opts.message }
  }

  // First message — build context and send as prompt
  const target: ChatTarget = opts.targetType === 'map_run'
    ? { type: 'map_run', sessionId: opts.sessionId, runNumber: opts.targetId }
    : { type: 'review_round', sessionId: opts.sessionId, roundNumber: opts.targetId }

  const context = buildChatContext(ocrDir, target)
  return { flags, prompt: `${context}\n\nUser: ${opts.message}` }
}
