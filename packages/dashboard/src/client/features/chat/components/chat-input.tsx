import { useCallback, useRef, useState } from 'react'
import { SendHorizontal } from 'lucide-react'
import { cn } from '../../../lib/utils'
import type { ChatTargetType } from '../../../lib/api-types'

type ChatInputProps = {
  onSend: (text: string) => void
  isStreaming: boolean
  disabled?: boolean
  targetType: ChatTargetType
}

const placeholders: Record<ChatTargetType, string> = {
  map_run: 'Ask about this map...',
  review_round: 'Ask about this review...',
}

export function ChatInput({ onSend, isStreaming, disabled, targetType }: ChatInputProps) {
  const [value, setValue] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const adjustHeight = useCallback(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    // Clamp to ~4 rows (80px)
    el.style.height = `${Math.min(el.scrollHeight, 80)}px`
  }, [])

  const handleSend = useCallback(() => {
    if (!value.trim() || isStreaming || disabled) return
    onSend(value)
    setValue('')
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }
  }, [value, isStreaming, onSend])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        handleSend()
      }
    },
    [handleSend],
  )

  return (
    <div className="flex items-end gap-2 border-t border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900">
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => {
          setValue(e.target.value)
          adjustHeight()
        }}
        onKeyDown={handleKeyDown}
        placeholder={placeholders[targetType]}
        rows={1}
        className={cn(
          'flex-1 resize-none rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm',
          'placeholder:text-zinc-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500',
          'dark:border-zinc-700 dark:bg-zinc-800 dark:placeholder:text-zinc-500',
        )}
      />
      <button
        type="button"
        onClick={handleSend}
        disabled={isStreaming || !value.trim()}
        className={cn(
          'flex-shrink-0 rounded-md p-2 transition-colors',
          'bg-indigo-600 text-white hover:bg-indigo-700',
          'disabled:cursor-not-allowed disabled:opacity-50',
        )}
      >
        <SendHorizontal className="h-4 w-4" />
      </button>
    </div>
  )
}
