/**
 * Message entry — the dominant visual.
 *
 * Renders the AI's prose with full markdown support via the shared
 * MarkdownRenderer (react-markdown + remark-gfm + rehype-highlight).
 * No card chrome, no bubble — it should read as a paragraph in the feed.
 */

import { MarkdownRenderer } from '../../../../components/markdown/markdown-renderer'

type MessageEntryProps = {
  text: string
}

export function MessageEntry({ text }: MessageEntryProps) {
  return (
    <div className="py-1 text-sm leading-relaxed text-zinc-800 dark:text-zinc-200">
      <MarkdownRenderer content={text} />
    </div>
  )
}
