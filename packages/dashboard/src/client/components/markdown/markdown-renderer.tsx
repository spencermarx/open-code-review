import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeHighlight from 'rehype-highlight'
import type { Components } from 'react-markdown'
import { cn } from '../../lib/utils'

type MarkdownRendererProps = {
  content: string
  className?: string
}

/* eslint-disable @typescript-eslint/no-unused-vars --
   react-markdown passes `node` in props; we destructure it out
   to avoid passing it to DOM elements. */

const components: Components = {
  h1({ node, className, ...props }) {
    return (
      <h1
        className={cn('mt-8 mb-4 text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100 first:mt-0', className)}
        {...props}
      />
    )
  },
  h2({ node, className, ...props }) {
    return (
      <h2
        className={cn('mt-8 mb-3 text-xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100', className)}
        {...props}
      />
    )
  },
  h3({ node, className, ...props }) {
    return (
      <h3
        className={cn('mt-6 mb-2 text-lg font-semibold text-zinc-900 dark:text-zinc-100', className)}
        {...props}
      />
    )
  },
  h4({ node, className, ...props }) {
    return (
      <h4
        className={cn('mt-4 mb-2 text-base font-semibold text-zinc-900 dark:text-zinc-100', className)}
        {...props}
      />
    )
  },
  p({ node, className, ...props }) {
    return (
      <p
        className={cn('mb-4 leading-7 text-zinc-700 dark:text-zinc-300 last:mb-0', className)}
        {...props}
      />
    )
  },
  a({ node, className, ...props }) {
    return (
      <a
        className={cn('font-medium text-blue-600 underline underline-offset-4 hover:text-blue-500 dark:text-blue-400 dark:hover:text-blue-300', className)}
        target="_blank"
        rel="noopener noreferrer"
        {...props}
      />
    )
  },
  ul({ node, className, ...props }) {
    return (
      <ul className={cn('mb-4 ml-6 list-disc space-y-1 text-zinc-700 dark:text-zinc-300', className)} {...props} />
    )
  },
  ol({ node, className, ...props }) {
    return (
      <ol className={cn('mb-4 ml-6 list-decimal space-y-1 text-zinc-700 dark:text-zinc-300', className)} {...props} />
    )
  },
  li({ node, className, ...props }) {
    return <li className={cn('leading-7', className)} {...props} />
  },
  blockquote({ node, className, ...props }) {
    return (
      <blockquote
        className={cn('mb-4 border-l-4 border-zinc-300 pl-4 italic text-zinc-600 dark:border-zinc-700 dark:text-zinc-400', className)}
        {...props}
      />
    )
  },
  hr({ node, ...props }) {
    return <hr className="my-6 border-zinc-200 dark:border-zinc-800" {...props} />
  },
  strong({ node, className, ...props }) {
    return <strong className={cn('font-semibold text-zinc-900 dark:text-zinc-100', className)} {...props} />
  },
  code({ node, className, children, ...props }) {
    const isInline = !className?.includes('hljs')
    if (isInline) {
      return (
        <code
          className={cn(
            'rounded-md bg-zinc-100 px-1.5 py-0.5 text-sm font-mono text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200',
            className,
          )}
          {...props}
        >
          {children}
        </code>
      )
    }
    return (
      <code className={cn('text-sm', className)} {...props}>
        {children}
      </code>
    )
  },
  pre({ node, className, ...props }) {
    return (
      <pre
        className={cn(
          'mb-4 overflow-x-auto rounded-lg border border-zinc-200 bg-zinc-50 p-4 text-sm dark:border-zinc-800 dark:bg-zinc-900',
          className,
        )}
        {...props}
      />
    )
  },
  table({ node, className, ...props }) {
    return (
      <div className="mb-4 overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
        <table className={cn('w-full text-sm', className)} {...props} />
      </div>
    )
  },
  thead({ node, className, ...props }) {
    return <thead className={cn('bg-zinc-50 dark:bg-zinc-900', className)} {...props} />
  },
  th({ node, className, ...props }) {
    return (
      <th
        className={cn('border-b border-zinc-200 px-4 py-2 text-left font-medium text-zinc-900 dark:border-zinc-800 dark:text-zinc-100', className)}
        {...props}
      />
    )
  },
  td({ node, className, ...props }) {
    return (
      <td
        className={cn('border-b border-zinc-200 px-4 py-2 text-zinc-700 dark:border-zinc-800 dark:text-zinc-300', className)}
        {...props}
      />
    )
  },
  img({ node, className, ...props }) {
    return <img className={cn('mb-4 max-w-full rounded-lg', className)} {...props} />
  },
}

export function MarkdownRenderer({ content, className }: MarkdownRendererProps) {
  return (
    <div className={cn('ocr-markdown', className)}>
      <Markdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeHighlight]}
        components={components}
      >
        {content}
      </Markdown>
    </div>
  )
}
