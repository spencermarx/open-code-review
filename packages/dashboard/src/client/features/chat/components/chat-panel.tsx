import { useEffect, useRef } from 'react'
import { X, MessageSquare, Terminal } from 'lucide-react'
import { cn } from '../../../lib/utils'
import { useChat } from '../hooks/use-chat'
import { useAiCli } from '../../../hooks/use-ai-cli'
import { ChatMessage, StreamingMessage } from './chat-message'
import { ChatInput } from './chat-input'
import type { ChatTargetType } from '../../../lib/api-types'

type ChatPanelProps = {
  sessionId: string
  targetType: ChatTargetType
  targetId: number
  onClose: () => void
}

export function ChatPanel({ sessionId, targetType, targetId, onClose }: ChatPanelProps) {
  const { isAvailable, isDisabledByConfig } = useAiCli()
  const {
    messages,
    sendMessage,
    isStreaming,
    streamingContent,
    toolStatus,
    toolHistory,
    error,
  } = useChat(sessionId, targetType, targetId)

  const scrollRef = useRef<HTMLDivElement>(null)

  // Close panel on Escape key
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  // Auto-scroll on new messages or streaming content
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
  }, [messages, streamingContent, toolStatus])

  return (
    <div
      className={cn(
        'fixed right-0 top-0 z-50 flex h-full w-[400px] flex-col',
        'border-l border-zinc-200 bg-white shadow-xl',
        'dark:border-zinc-800 dark:bg-zinc-950',
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
        <div className="flex items-center gap-2">
          <MessageSquare className="h-4 w-4 text-indigo-500" />
          <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            Ask the Team
          </h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-md p-1 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto p-4">
        {!isAvailable && messages.length === 0 && (
          <div className="flex items-start gap-2.5 rounded-md border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-900/50">
            <Terminal className="mt-0.5 h-4 w-4 shrink-0 text-zinc-400" />
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              {isDisabledByConfig
                ? <>AI commands are turned off in your project config. Set <code className="rounded bg-zinc-200 px-1 py-0.5 text-[10px] dark:bg-zinc-800">ai_cli</code> to <code className="rounded bg-zinc-200 px-1 py-0.5 text-[10px] dark:bg-zinc-800">auto</code>, <code className="rounded bg-zinc-200 px-1 py-0.5 text-[10px] dark:bg-zinc-800">claude</code>, or <code className="rounded bg-zinc-200 px-1 py-0.5 text-[10px] dark:bg-zinc-800">opencode</code> in <code className="rounded bg-zinc-200 px-1 py-0.5 text-[10px] dark:bg-zinc-800">.ocr/config.yaml</code> to enable Ask the Team.</>
                : 'Install Claude Code or OpenCode to use Ask the Team.'}
            </p>
          </div>
        )}
        {isAvailable && messages.length === 0 && !isStreaming && (
          <p className="text-center text-sm text-zinc-400 dark:text-zinc-500">
            Ask a question about this {targetType === 'map_run' ? 'map' : 'review'} to get
            started.
          </p>
        )}

        {messages.map((msg) => (
          <ChatMessage key={msg.id} message={msg} />
        ))}

        {isStreaming && (
          <StreamingMessage
            content={streamingContent}
            toolStatus={toolStatus}
            toolHistory={toolHistory}
          />
        )}

        {error && (
          <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-400">
            {error}
          </div>
        )}
      </div>

      {/* Input */}
      <ChatInput onSend={sendMessage} isStreaming={isStreaming} disabled={!isAvailable} targetType={targetType} />
    </div>
  )
}
