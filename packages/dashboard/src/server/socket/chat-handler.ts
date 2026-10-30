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
import { descendantPids, reapTree } from '@open-code-review/platform'
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
      const stopForDisallowedTool = (tool: string) => {
        if (disallowedTool !== null) return
        disallowedTool = tool
        if (proc.pid !== undefined) {
          // Kill what the CLI started before the CLI itself, while those
          // processes are still its descendants. Windows has no `ps` walk;
          // reapTree's `taskkill /T /F` covers the tree there.
          for (const pid of descendantPids(proc.pid)) {
            try {
              process.kill(pid, 'SIGKILL')
            } catch {
              // already gone
            }
          }
          reapTree(proc.pid, 0)
        }
        proc.kill('SIGKILL')
      }

      // UTF-8 boundary safety — round-2 Blocker 1 (sweep completion).
      // Without setEncoding, multi-byte codepoints split across pipe
      // chunks become `�` and the line containing them fails JSON.parse,
      // silently dropping events including `session_id` capture lines.
      // The chat handler's `capturedClaudeSessionId` (line 245, 273) is
      // the same loss mode round-1 surfaced for command-runner.
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
                if (!isReadOnlyQueryTool(evt.name)) {
                  stopForDisallowedTool(evt.name)
                  return
                }
                announcedTools.add(evt.toolId)
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
              case 'tool_result':
                if (!announcedTools.has(evt.toolId)) {
                  stopForDisallowedTool('unannounced tool')
                  return
                }
                break
              // tool_input_delta, error: not surfaced in the chat UI today —
              // the chat status row already shows tool name and the
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
        // Process any remaining buffered data, with the same backstop checks
        if (disallowedTool === null && lineBuffer.trim()) {
          for (const evt of parser.parseLine(lineBuffer)) {
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
              case 'tool_call':
                if (!isReadOnlyQueryTool(evt.name)) disallowedTool ??= evt.name
                else announcedTools.add(evt.toolId)
                break
              case 'tool_result':
                if (!announcedTools.has(evt.toolId)) disallowedTool ??= 'unannounced tool'
                break
            }
          }
        }

        if (disallowedTool !== null) {
          const errMsg = `Stopped: the AI tried to use a tool outside the chat's read-only set (${disallowedTool}).`
          // A resumed turn ran inside the stored session; drop it so the next
          // message starts a fresh one.
          updateConversationClaudeSession(db, conversationId, null)
          tracker.appendOutput(`\n✗ ${errMsg}\n`)
          tracker.finish(code ?? 1)
          socket.emit('chat:error', { conversationId, error: errMsg })
          resetIdleTimer(conversationId, db)
          const chat = activeChats.get(conversationId)
          if (chat) chat.process = null
          return
        }

        // Store Claude session ID for future resume
        if (capturedClaudeSessionId) {
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

        // Reset idle timer (keep entry for session tracking)
        resetIdleTimer(conversationId, db)
        // Remove process reference since it's done
        const chat = activeChats.get(conversationId)
        if (chat) {
          chat.process = null
        }
      })

      proc.on('error', (err) => {
        tracker.appendOutput(`\n✗ Failed to spawn: ${err.message}\n`)
        tracker.finish(-1)
        socket.emit('chat:error', {
          conversationId,
          error: `Failed to spawn AI CLI: ${err.message}`,
        })
        cleanupChat(conversationId)
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
