import { useEffect, useState } from 'react'
import { cn, parseUtcDate } from '../../../lib/utils'
import { MarkdownRenderer } from '../../../components/markdown/markdown-renderer'
import { AgentActivity } from './agent-activity'
import type { ChatMessage as ChatMessageType, ChatToolStatus } from '../../../lib/api-types'

type ChatMessageProps = {
  message: ChatMessageType
}

export function ChatMessage({ message }: ChatMessageProps) {
  const isUser = message.role === 'user'
  const time = parseUtcDate(message.created_at).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  })

  return (
    <div className={cn('flex flex-col', isUser ? 'items-end' : 'items-start')}>
      <div
        className={cn(
          'max-w-[85%] rounded-lg px-3 py-2 text-sm',
          isUser
            ? 'bg-indigo-600 text-white'
            : 'bg-zinc-100 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100',
        )}
      >
        {isUser ? (
          <p className="whitespace-pre-wrap">{message.content}</p>
        ) : (
          <MarkdownRenderer content={message.content} />
        )}
      </div>
      <span className="mt-1 text-[10px] text-zinc-400 dark:text-zinc-500">
        {time}
      </span>
    </div>
  )
}

// ── Streaming / thinking indicator ──

const THINKING_PHRASES = [
  'Reading the code review artifacts...',
  'Analyzing the changeset structure...',
  'Examining file relationships...',
  'Reviewing the findings...',
  'Connecting the patterns...',
  'Preparing a thoughtful response...',
]

type StreamingMessageProps = {
  content: string
  toolStatus: ChatToolStatus | null
  toolHistory: ChatToolStatus[]
}

export function StreamingMessage({ content, toolStatus, toolHistory }: StreamingMessageProps) {
  const [phraseIndex, setPhraseIndex] = useState(0)
  const hasActivity = toolStatus !== null || toolHistory.length > 0

  useEffect(() => {
    if (content || hasActivity) return // Stop rotating once tokens or tool activity arrives
    const interval = setInterval(() => {
      setPhraseIndex((i) => (i + 1) % THINKING_PHRASES.length)
    }, 2500)
    return () => clearInterval(interval)
  }, [content, hasActivity])

  return (
    <div className="flex flex-col items-start">
      <div className="max-w-[85%] rounded-lg bg-zinc-100 px-3 py-2 text-sm text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100">
        {content ? (
          <>
            <MarkdownRenderer content={content} />
            <span className="ml-0.5 inline-block h-4 w-0.5 animate-pulse bg-zinc-400 dark:bg-zinc-500" />
          </>
        ) : hasActivity ? (
          <AgentActivity currentStatus={toolStatus} history={toolHistory} />
        ) : (
          <ThinkingIndicator phrase={THINKING_PHRASES[phraseIndex]!} />
        )}

        {/* Show agent activity below streamed content when both exist */}
        {content && hasActivity && (
          <div className="mt-2 border-t border-zinc-200 pt-2 dark:border-zinc-700">
            <AgentActivity currentStatus={toolStatus} history={toolHistory} />
          </div>
        )}
      </div>
    </div>
  )
}

function ThinkingIndicator({ phrase }: { phrase: string }) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex gap-1">
        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-indigo-400 [animation-delay:0ms]" />
        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-indigo-400 [animation-delay:150ms]" />
        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-indigo-400 [animation-delay:300ms]" />
      </div>
      <span className="animate-pulse text-xs text-zinc-400 dark:text-zinc-500">
        {phrase}
      </span>
    </div>
  )
}
