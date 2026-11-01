/**
 * Socket.IO chat handler.
 *
 * Manages "Ask the Team" AI chat conversations by spawning an AI CLI
 * process via the adapter strategy, streaming normalized events as
 * socket events, and persisting messages to the database.
 */

import type { ChildProcess } from 'node:child_process'
import { dirname } from 'node:path'
import type { Server as SocketIOServer, Socket } from 'socket.io'
import type { Database } from '@open-code-review/persistence'
import { killTreeNow } from '@open-code-review/platform'
import {
  getConversation,
  getMessages,
  insertMessage,
  upsertConversation,
  updateConversationClaudeSession,
  updateConversationStatus,
  type ChatConversationRow,
} from '../db.js'
import { buildChatContext, type ChatTarget } from '../services/chat-context.js'
import {
  AiCliService,
  formatToolDetail,
  isReadOnlyQueryTool,
  UnsupportedCliVersionError,
  type NormalizedEvent,
  type SpawnResult,
} from '../services/ai-cli/index.js'
import { startTrackedExecution, type TrackedExecution } from './execution-tracker.js'

// ── Types ──

type ChatSendPayload = {
  conversationId: string
  sessionId: string
  targetType: ChatConversationRow['target_type']
  targetId: number
  message: string
}

type ChatHistoryPayload = {
  conversationId: string
}

// ── Constants ──

/** Conversations expire after 48 hours of inactivity. */
const IDLE_TIMEOUT_MS = 48 * 60 * 60 * 1000

// ── Active processes ──

type ActiveChat = {
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
): void {
  const chat = activeChats.get(conversationId)
  if (chat) {
    clearTimeout(chat.timer)
    chat.timer = setTimeout(() => {
      updateConversationStatus(db, conversationId, 'expired')
      cleanupChat(conversationId)
    }, IDLE_TIMEOUT_MS)
  }
}

/**
 * Registers chat socket handlers for a connected client.
 */
export function registerChatHandlers(
  io: SocketIOServer,
  socket: Socket,
  db: Database,
  ocrDir: string,
  aiCliService: AiCliService
): void {
  socket.on('chat:send', (payload: ChatSendPayload) => {
    try {
      const { conversationId, sessionId, targetType, targetId, message } = payload ?? {} as ChatSendPayload

      if (
        typeof conversationId !== 'string' ||
        typeof sessionId !== 'string' ||
        typeof targetType !== 'string' ||
        typeof message !== 'string'
      ) {
        socket.emit('chat:error', {
          conversationId: typeof conversationId === 'string' ? conversationId : null,
          error: 'Invalid payload: conversationId, sessionId, targetType, and message must be strings',
        })
        return
      }

      if (!aiCliService.isAvailable()) {
        socket.emit('chat:error', {
          conversationId,
          error: 'No AI CLI available. Install Claude Code or OpenCode to use the chat feature.',
        })
        return
      }

      // One turn per conversation: a reload or a second tab can send while a
      // turn is running, and the later `close` would overwrite the stored
      // session. Keyed on the child being alive, not on `process`, which only
      // `close` nulls: a `close` that never fires must not lock the chat.
      const running = activeChats.get(conversationId)?.process
      if (running && running.exitCode === null && running.signalCode === null) {
        socket.emit('chat:error', {
          conversationId,
          error: 'A response is already in progress for this conversation.',
        })
        return
      }

      // Ensure conversation exists in DB
      upsertConversation(db, conversationId, sessionId, targetType, targetId)

      // Store user message
      insertMessage(db, conversationId, 'user', message)

      // Check if conversation has a Claude session to resume
      const conversation = getConversation(db, conversationId)
      const claudeSessionId = conversation?.claude_session_id ?? null

      // Build context for first message (no session to resume)
      let prompt: string
      if (claudeSessionId) {
        prompt = message
      } else {
        const target: ChatTarget = targetType === 'map_run'
          ? { type: 'map_run', sessionId, runNumber: targetId }
          : { type: 'review_round', sessionId, roundNumber: targetId }
        const context = buildChatContext(ocrDir, target)
        prompt = `${context}\n\nUser: ${message}`
      }

      const adapter = aiCliService.getAdapter()
      if (!adapter) {
        socket.emit('chat:error', {
          conversationId,
          error: 'No AI CLI adapter available',
        })
        return
      }

      // Validate resumeSessionId format before passing to adapter
      const resumeId = claudeSessionId ?? undefined
      if (resumeId && !/^[a-zA-Z0-9_-]+$/.test(resumeId)) {
        socket.emit('chat:error', {
          conversationId,
          error: 'Invalid resume session ID format',
        })
        return
      }

      const repoRoot = dirname(ocrDir)
      // Query mode IS the read-only (Read/Grep/Glob) contract; the adapter
      // enforces it or throws — e.g. on a CLI too old to enforce it.
      let spawnResult: SpawnResult
      try {
        spawnResult = adapter.spawn({
          prompt,
          cwd: repoRoot,
          mode: 'query',
          maxTurns: 1,
          resumeSessionId: resumeId,
        })
      } catch (err) {
        if (!(err instanceof UnsupportedCliVersionError)) {
          console.error('[chat-handler] AI CLI spawn failed:', err)
        }
        socket.emit('chat:error', {
          conversationId,
          error:
            err instanceof UnsupportedCliVersionError ? err.message : 'Failed to spawn AI CLI',
        })
        return
      }
      const proc = spawnResult.process

      // Track the process
      const timer = setTimeout(() => {
        updateConversationStatus(db, conversationId, 'expired')
        cleanupChat(conversationId)
      }, IDLE_TIMEOUT_MS)

      activeChats.set(conversationId, { process: proc, conversationId, timer })

      // Track in command_executions for active commands + history
      const chatLabel = targetType === 'map_run' ? 'map' : 'review'
      const tracker = startTrackedExecution(
        io, db, ocrDir,
        `ocr chat (${chatLabel})`,
        [sessionId],
      )
      tracker.appendOutput('▸ Ask the Team — processing message...\n')

      // Parse normalized event stream for assistant text tokens and tool activity.
      // The parser is stateful — we create one per spawn so streaming
      // tool input deltas can be assembled correctly.
      const parser = adapter.createParser()
      let assistantText = ''
      let lineBuffer = ''
      let capturedClaudeSessionId: string | null = null
      let thinkingStatusEmitted = false

      // Backstop for the adapter's read-only restriction. The child is never
      // offered a tool outside Read/Grep/Glob, so any call to one — or a
      // result for a call that was never announced — stops the turn, and the
      // conversation keeps neither the answer nor a session to resume.
      const announcedTools = new Set<string>()
      let disallowedTool: string | null = null
      /** The label to stop on for this event, or null if it is within the set. */
      const backstopViolation = (evt: NormalizedEvent): string | null => {
        if (evt.type === 'tool_call') {
          if (!isReadOnlyQueryTool(evt.name)) return evt.name
          announcedTools.add(evt.toolId)
        } else if (evt.type === 'tool_result' && !announcedTools.delete(evt.toolId)) {
          return 'unannounced tool'
        }
        return null
      }
      /** Logs a failure: a stop must still reach its kill and its `chat:error`. */
      const clearStoredSession = () => {
        try {
          updateConversationClaudeSession(db, conversationId, null)
        } catch (err) {
          console.error('[chat-handler] failed to clear the stored session:', err)
        }
      }
      const stopForDisallowedTool = (tool: string) => {
        disallowedTool = tool
        // Stdout can outlast the child, and an exited child's pid can be reused.
        if (proc.pid !== undefined && proc.exitCode === null && proc.signalCode === null) {
          killTreeNow(proc.pid)
        }
        proc.kill('SIGKILL')
        // `close` also waits for stdio EOF, which a process outside the tree
        // can withhold by holding these pipes. Destroying them leaves `close`
        // waiting only on the CLI's own exit.
        proc.stdout?.destroy()
        proc.stderr?.destroy()
        // After the kill: this write can block on the shared database.
        clearStoredSession()
      }

      // UTF-8 boundary safety — round-2 Blocker 1 (sweep completion).
      // Without setEncoding, multi-byte codepoints split across pipe
      // chunks become `�` and the line containing them fails JSON.parse,
      // silently dropping events including `session_id` capture lines.
      // The chat handler's `capturedClaudeSessionId` is the same loss mode
      // round-1 surfaced for command-runner.
      proc.stdout?.setEncoding('utf-8')
      proc.stderr?.setEncoding('utf-8')

      proc.stdout?.on('data', (chunk: string) => {
        if (disallowedTool !== null) return
        lineBuffer += chunk
        const lines = lineBuffer.split('\n')
        // Keep the last incomplete line in the buffer
        lineBuffer = lines.pop() ?? ''

        for (const line of lines) {
          if (!line.trim()) continue
          for (const evt of parser.parseLine(line)) {
            const violation = backstopViolation(evt)
            if (violation !== null) {
              stopForDisallowedTool(violation)
              return
            }
            switch (evt.type) {
              case 'text_delta':
                assistantText += evt.text
                socket.emit('chat:token', { conversationId, token: evt.text })
                break
              case 'thinking_delta':
                if (!thinkingStatusEmitted) {
                  thinkingStatusEmitted = true
                  socket.emit('chat:status', {
                    conversationId,
                    tool: 'thinking',
                    detail: 'Thinking...',
                  })
                  tracker.appendOutput('▸ Thinking...\n')
                }
                break
              case 'tool_call': {
                const detail = formatToolDetail(evt.name, evt.input)
                socket.emit('chat:status', {
                  conversationId,
                  tool: evt.name,
                  detail,
                })
                tracker.appendOutput(`▸ ${detail}\n`)
                break
              }
              case 'message':
                assistantText = evt.text
                break
              case 'session_id':
                capturedClaudeSessionId = evt.id
                break
              // tool_input_delta, tool_result, error: not surfaced in the chat UI
              // today — the chat status row already shows tool name and the
              // assistant message will reflect the result.
            }
          }
        }
      })

      // Capture stderr for error reporting (encoding set above)
      let stderrBuffer = ''
      proc.stderr?.on('data', (chunk: string) => {
        stderrBuffer += chunk
      })

      proc.on('close', (code) => {
        // False once a later turn has replaced this one, which the guard allows
        // as soon as this child exits. The conversation's session and process
        // reference then belong to that turn. This turn's answer and tracker
        // are still its own, and `socket` still reaches this turn's tab.
        const current = activeChats.get(conversationId)?.process === proc
        const releaseTurn = () => {
          if (!current) return
          // Reset idle timer (keep entry for session tracking)
          resetIdleTimer(conversationId, db)
          // Remove process reference since it's done
          const chat = activeChats.get(conversationId)
          if (chat) chat.process = null
        }

        // Process any remaining buffered data, with the same backstop checks
        if (disallowedTool === null && lineBuffer.trim()) {
          for (const evt of parser.parseLine(lineBuffer)) {
            disallowedTool ??= backstopViolation(evt)
            switch (evt.type) {
              case 'text_delta':
                assistantText += evt.text
                break
              case 'message':
                assistantText = evt.text
                break
              case 'session_id':
                capturedClaudeSessionId = evt.id
                break
            }
          }
        }

        if (disallowedTool !== null) {
          const errMsg = `Stopped: the AI tried to use a tool outside the chat's read-only set (${disallowedTool}).`
          // A resumed turn ran inside the stored session; drop it so the next
          // message starts a fresh one. A later turn that already resumed it
          // runs on, but won't store it again. A stop on the buffered last line
          // reaches this without going through stopForDisallowedTool, and this
          // is the retry for one that did.
          clearStoredSession()
          tracker.appendOutput(`\n✗ ${errMsg}\n`)
          // Never 0: the CLI may have exited cleanly before it was stopped.
          tracker.finish(code || 1)
          socket.emit('chat:error', { conversationId, error: errMsg })
          releaseTurn()
          return
        }

        // Store Claude session ID for future resume. A turn that resumed a
        // session only keeps it while it's still stored: a replaced turn's stop
        // may have dropped it during this turn.
        const resumedStillStored =
          !resumeId || getConversation(db, conversationId)?.claude_session_id === resumeId
        if (capturedClaudeSessionId && current && resumedStillStored) {
          updateConversationClaudeSession(db, conversationId, capturedClaudeSessionId)
        }

        // Store assistant response
        if (assistantText.trim()) {
          insertMessage(db, conversationId, 'assistant', assistantText.trim())
        }

        if (code === 0) {
          tracker.appendOutput('\n✓ Response complete\n')
          tracker.finish(0)
          socket.emit('chat:done', { conversationId })
        } else {
          const errMsg = stderrBuffer || `CLI process exited with code ${code}`
          tracker.appendOutput(`\n✗ ${errMsg}\n`)
          tracker.finish(code)
          socket.emit('chat:error', {
            conversationId,
            error: errMsg,
          })
        }

        releaseTurn()
      })

      proc.on('error', (err) => {
        tracker.appendOutput(`\n✗ Failed to spawn: ${err.message}\n`)
        tracker.finish(-1)
        socket.emit('chat:error', {
          conversationId,
          error: `Failed to spawn AI CLI: ${err.message}`,
        })
        if (activeChats.get(conversationId)?.process === proc) cleanupChat(conversationId)
      })
    } catch (err) {
      console.error('Error in chat:send handler:', err)
      socket.emit('error', { message: 'Internal error' })
    }
  })

  // Load conversation history
  socket.on('chat:history', (payload: ChatHistoryPayload) => {
    try {
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
    } catch (err) {
      console.error('Error in chat:history handler:', err)
      socket.emit('error', { message: 'Internal error' })
    }
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
