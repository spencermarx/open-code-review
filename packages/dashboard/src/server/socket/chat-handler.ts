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
import { AiCliService, formatToolDetail } from '../services/ai-cli/index.js'
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
      saveDb(db, ocrDir)

      // Store user message
      insertMessage(db, conversationId, 'user', message)
      saveDb(db, ocrDir)

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
      const spawnResult = adapter.spawn({
        prompt,
        cwd: repoRoot,
        mode: 'query',
        maxTurns: 1,
        allowedTools: ['Read', 'Grep', 'Glob'],
        resumeSessionId: resumeId,
      })
      const proc = spawnResult.process

      // Track the process
      const timer = setTimeout(() => {
        updateConversationStatus(db, conversationId, 'expired')
        saveDb(db, ocrDir)
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

      // Parse normalized event stream for assistant text tokens and tool activity
      let assistantText = ''
      let lineBuffer = ''
      let capturedClaudeSessionId: string | null = null
      let thinkingStatusEmitted = false

      proc.stdout?.on('data', (chunk: Buffer) => {
        lineBuffer += chunk.toString()
        const lines = lineBuffer.split('\n')
        // Keep the last incomplete line in the buffer
        lineBuffer = lines.pop() ?? ''

        for (const line of lines) {
          if (!line.trim()) continue
          for (const evt of adapter.parseLine(line)) {
            switch (evt.type) {
              case 'text':
                assistantText += evt.text
                socket.emit('chat:token', { conversationId, token: evt.text })
                break
              case 'thinking':
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
              case 'tool_start':
                if (evt.name !== '__input_json_delta') {
                  const detail = formatToolDetail(evt.name, evt.input)
                  socket.emit('chat:status', {
                    conversationId,
                    tool: evt.name,
                    detail,
                  })
                  tracker.appendOutput(`▸ ${detail}\n`)
                }
                break
              case 'full_text':
                assistantText = evt.text
                break
              case 'session_id':
                capturedClaudeSessionId = evt.id
                break
            }
          }
        }
      })

      // Capture stderr for error reporting
      let stderrBuffer = ''
      proc.stderr?.on('data', (chunk: Buffer) => {
        stderrBuffer += chunk.toString()
      })

      proc.on('close', (code) => {
        // Process any remaining buffered data
        if (lineBuffer.trim()) {
          for (const evt of adapter.parseLine(lineBuffer)) {
            switch (evt.type) {
              case 'text':
                assistantText += evt.text
                break
              case 'full_text':
                assistantText = evt.text
                break
              case 'session_id':
                capturedClaudeSessionId = evt.id
                break
            }
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
        resetIdleTimer(conversationId, db, ocrDir)
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
