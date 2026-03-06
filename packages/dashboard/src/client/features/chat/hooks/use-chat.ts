import { useCallback, useEffect, useRef, useState } from 'react'
import { useSocket, useSocketEvent } from '../../../providers/socket-provider'
import type { ChatMessage, ChatTargetType, ChatToolStatus } from '../../../lib/api-types'

type UseChatReturn = {
  messages: ChatMessage[]
  sendMessage: (text: string) => void
  isStreaming: boolean
  streamingContent: string
  toolStatus: ChatToolStatus | null
  toolHistory: ChatToolStatus[]
  error: string | null
}

export function useChat(
  sessionId: string,
  targetType: ChatTargetType,
  targetId: number,
): UseChatReturn {
  const { socket } = useSocket()
  const conversationId = `chat-${sessionId}-${targetType}-${targetId}`

  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [isStreaming, setIsStreaming] = useState(false)
  const [streamingContent, setStreamingContent] = useState('')
  const [toolStatus, setToolStatus] = useState<ChatToolStatus | null>(null)
  const [toolHistory, setToolHistory] = useState<ChatToolStatus[]>([])
  const [error, setError] = useState<string | null>(null)

  const streamingRef = useRef('')

  // Load history on mount
  useEffect(() => {
    if (!socket) return
    socket.emit('chat:history', { conversationId })
  }, [socket, conversationId])

  // Receive history response
  useSocketEvent<{ conversationId: string; messages: ChatMessage[] }>(
    'chat:history:result',
    useCallback(
      (data) => {
        if (data.conversationId !== conversationId) return
        setMessages(data.messages)
      },
      [conversationId],
    ),
  )

  // Streaming tokens
  useSocketEvent<{ conversationId: string; token: string }>(
    'chat:token',
    useCallback(
      (data) => {
        if (data.conversationId !== conversationId) return
        streamingRef.current += data.token
        setStreamingContent(streamingRef.current)
      },
      [conversationId],
    ),
  )

  // Tool activity status
  useSocketEvent<{ conversationId: string; tool: string; detail: string }>(
    'chat:status',
    useCallback(
      (data) => {
        if (data.conversationId !== conversationId) return
        const status: ChatToolStatus = {
          tool: data.tool,
          detail: data.detail,
          timestamp: Date.now(),
        }
        setToolStatus(status)
        setToolHistory((prev) => [...prev, status])
      },
      [conversationId],
    ),
  )

  // Streaming complete
  useSocketEvent<{ conversationId: string }>(
    'chat:done',
    useCallback(
      (data) => {
        if (data.conversationId !== conversationId) return
        const assistantMsg: ChatMessage = {
          id: Date.now(),
          conversation_id: conversationId,
          role: 'assistant',
          content: streamingRef.current,
          created_at: new Date().toISOString(),
        }
        setMessages((prev) => [...prev, assistantMsg])
        setIsStreaming(false)
        setStreamingContent('')
        setToolStatus(null)
        setToolHistory([])
        streamingRef.current = ''
      },
      [conversationId],
    ),
  )

  // Error
  useSocketEvent<{ conversationId: string; error: string }>(
    'chat:error',
    useCallback(
      (data) => {
        if (data.conversationId !== conversationId) return
        setError(data.error)
        setIsStreaming(false)
        setStreamingContent('')
        setToolStatus(null)
        setToolHistory([])
        streamingRef.current = ''
      },
      [conversationId],
    ),
  )

  const sendMessage = useCallback(
    (text: string) => {
      if (!socket || !text.trim() || isStreaming) return

      const userMsg: ChatMessage = {
        id: Date.now(),
        conversation_id: conversationId,
        role: 'user',
        content: text.trim(),
        created_at: new Date().toISOString(),
      }
      setMessages((prev) => [...prev, userMsg])
      setIsStreaming(true)
      setError(null)
      setToolStatus(null)
      setToolHistory([])
      streamingRef.current = ''

      socket.emit('chat:send', {
        conversationId,
        sessionId,
        targetType,
        targetId,
        message: text.trim(),
      })
    },
    [socket, conversationId, sessionId, targetType, targetId, isStreaming],
  )

  return { messages, sendMessage, isStreaming, streamingContent, toolStatus, toolHistory, error }
}
