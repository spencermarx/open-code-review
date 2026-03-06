import { Handshake, Swords, Link2, Lightbulb } from 'lucide-react'
import { cn } from '../../lib/utils'
import { MarkdownRenderer } from './markdown-renderer'

type DiscourseType = 'AGREE' | 'CHALLENGE' | 'CONNECT' | 'SURFACE'

type DiscourseBlockProps = {
  type: DiscourseType
  content: string
  reviewer?: string
  className?: string
}

const DISCOURSE_CONFIG: Record<
  DiscourseType,
  { icon: typeof Handshake; borderColor: string; bgColor: string; label: string }
> = {
  AGREE: {
    icon: Handshake,
    borderColor: 'border-l-emerald-500',
    bgColor: 'bg-emerald-500/5',
    label: 'Agree',
  },
  CHALLENGE: {
    icon: Swords,
    borderColor: 'border-l-red-500',
    bgColor: 'bg-red-500/5',
    label: 'Challenge',
  },
  CONNECT: {
    icon: Link2,
    borderColor: 'border-l-blue-500',
    bgColor: 'bg-blue-500/5',
    label: 'Connect',
  },
  SURFACE: {
    icon: Lightbulb,
    borderColor: 'border-l-amber-500',
    bgColor: 'bg-amber-500/5',
    label: 'Surface',
  },
}

export function DiscourseBlock({ type, content, reviewer, className }: DiscourseBlockProps) {
  const config = DISCOURSE_CONFIG[type]
  const Icon = config.icon

  return (
    <div
      className={cn(
        'rounded-r-lg border-l-4 p-4',
        config.borderColor,
        config.bgColor,
        className,
      )}
    >
      <div className="mb-2 flex items-center gap-2">
        <Icon className="h-4 w-4 text-zinc-600 dark:text-zinc-400" />
        <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
          {config.label}
        </span>
        {reviewer && (
          <span className="text-xs text-zinc-500 dark:text-zinc-400">
            — {reviewer}
          </span>
        )}
      </div>
      <MarkdownRenderer content={content} />
    </div>
  )
}

type DiscourseSection = {
  type: DiscourseType
  reviewer?: string
  content: string
}

export function parseDiscourseContent(markdown: string): DiscourseSection[] {
  const sections: DiscourseSection[] = []
  const pattern = /^###?\s+(AGREE|CHALLENGE|CONNECT|SURFACE)(?:\s*[-—]\s*(.+))?$/gm

  let match: RegExpExecArray | null
  let lastIndex = 0
  let lastSection: DiscourseSection | null = null

  while ((match = pattern.exec(markdown)) !== null) {
    if (lastSection) {
      lastSection.content = markdown.slice(lastIndex, match.index).trim()
      sections.push(lastSection)
    }
    lastSection = {
      type: match[1] as DiscourseType,
      reviewer: match[2]?.trim(),
      content: '',
    }
    lastIndex = match.index + match[0].length
  }

  if (lastSection) {
    lastSection.content = markdown.slice(lastIndex).trim()
    sections.push(lastSection)
  }

  return sections
}
