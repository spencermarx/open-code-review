/**
 * Live event-stream renderer.
 *
 * Reduces a flat StreamEvent[] into chronological "render blocks" — a
 * sequence of typed entries (message / thinking / tool / error) — and
 * draws them in a single feed with per-agent rail provenance.
 *
 * Key reductions:
 *   1. Consecutive `text_delta`s (since the last non-text event) collapse
 *      into one MessageEntry whose text grows char-by-char as the AI types.
 *   2. A standalone `message` event represents the final assistant snapshot.
 *      We fold it into a preceding text_delta block when it matches; otherwise
 *      it renders as its own block (Claude emits both, OpenCode only message).
 *   3. Consecutive `thinking_delta`s (since the last non-thinking event)
 *      collapse into one ThinkingEntry whose text grows as the reasoning
 *      arrives.
 *   4. `tool_call` opens a tool block. Subsequent `tool_input_delta`s with
 *      the same toolId append to that block's `inputPartial`. The matching
 *      `tool_result` flips it to done/error and supplies output text.
 *   5. `error` events render as ErrorEntry inline at their seq position.
 *   6. `session_id` events are journal-only — they don't render anything.
 *
 * Provenance:
 *   - Each block carries its `agentId`. The renderer wraps blocks in
 *     AgentRail. The agent name is shown in the gutter only on the first
 *     block of a contiguous run from the same agent.
 */

import { Fragment, useMemo } from 'react'
import { ArrowDown, Sparkles, FileSearch } from 'lucide-react'
import { cn } from '../../../../lib/utils'
import type { StreamEvent } from '../../../../lib/api-types'
import { AgentRail } from './agent-rail'
import { MessageEntry } from './message-entry'
import { ThinkingEntry } from './thinking-entry'
import { ToolEntry } from './tool-entry'
import { ErrorEntry } from './error-entry'
import { useStickToBottom } from './use-stick-to-bottom'

type EventStreamRendererProps = {
  events: StreamEvent[]
  isRunning: boolean
  className?: string
}

// ── Render-block model ──
//
// One per renderable thing in the feed. The renderer collapses streaming
// deltas into these blocks before rendering. `key` is a stable identifier
// usable as React key; we derive it from the originating event(s).

type MessageBlock = {
  kind: 'message'
  key: string
  agentId: string
  text: string
}

type ThinkingBlock = {
  kind: 'thinking'
  key: string
  agentId: string
  text: string
}

type ToolBlock = {
  kind: 'tool'
  key: string
  agentId: string
  toolId: string
  name: string
  input: Record<string, unknown>
  inputPartial: string
  /** Status; flips on tool_result. */
  status: 'pending' | 'running' | 'done' | 'error'
  /** Output text once tool_result arrives. */
  output?: string
}

type ErrorBlock = {
  kind: 'error'
  key: string
  agentId: string
  source: 'agent' | 'process'
  message: string
  detail?: string
}

type Block = MessageBlock | ThinkingBlock | ToolBlock | ErrorBlock

/**
 * Reduce a StreamEvent[] into a Block[]. Pure function — no React hooks —
 * so we can test it standalone if we want.
 */
export function reduceEventsToBlocks(events: StreamEvent[]): Block[] {
  const blocks: Block[] = []
  // toolId → block index for fast tool_result correlation
  const toolBlockIndex = new Map<string, number>()
  // For consecutive text/thinking deltas we keep an "open" block index so
  // additional deltas append rather than starting a new block.
  let openTextBlockIdx: number | null = null
  let openThinkingBlockIdx: number | null = null

  for (const evt of events) {
    // Any non-text VISIBLE event closes the current open text block.
    // `session_id` is metadata only — capturing it shouldn't fragment
    // the surrounding text rendering. Without this guard, a session_id
    // arriving between a text_delta stream and the canonical `message`
    // event closes the open block, the `message` falls into the
    // `openTextBlockIdx === null` branch, and the renderer paints the
    // same paragraph twice (once streamed, once snapshot).
    if (
      evt.type !== 'text_delta' &&
      evt.type !== 'message' &&
      evt.type !== 'session_id'
    ) {
      openTextBlockIdx = null
    }
    if (evt.type !== 'thinking_delta' && evt.type !== 'session_id') {
      openThinkingBlockIdx = null
    }

    switch (evt.type) {
      case 'text_delta': {
        if (openTextBlockIdx !== null) {
          const existing = blocks[openTextBlockIdx]
          if (existing && existing.kind === 'message') {
            existing.text += evt.text
          }
        } else {
          blocks.push({
            kind: 'message',
            key: `msg-${evt.seq}`,
            agentId: evt.agentId,
            text: evt.text,
          })
          openTextBlockIdx = blocks.length - 1
        }
        break
      }
      case 'message': {
        // If we have an open text block, the `message` event is just the
        // final snapshot of the same content the deltas already supplied.
        // Replace the streaming text with the canonical version.
        if (openTextBlockIdx !== null) {
          const existing = blocks[openTextBlockIdx]
          if (existing && existing.kind === 'message') {
            existing.text = evt.text
            // Don't close the open ref — further text_delta would be a
            // new message anyway, but the message itself is final.
          }
        } else {
          blocks.push({
            kind: 'message',
            key: `msg-${evt.seq}`,
            agentId: evt.agentId,
            text: evt.text,
          })
        }
        break
      }
      case 'thinking_delta': {
        if (openThinkingBlockIdx !== null) {
          const existing = blocks[openThinkingBlockIdx]
          if (existing && existing.kind === 'thinking') {
            existing.text += evt.text
          }
        } else {
          blocks.push({
            kind: 'thinking',
            key: `think-${evt.seq}`,
            agentId: evt.agentId,
            text: evt.text,
          })
          openThinkingBlockIdx = blocks.length - 1
        }
        break
      }
      case 'tool_call': {
        const block: ToolBlock = {
          kind: 'tool',
          key: `tool-${evt.toolId}-${evt.seq}`,
          agentId: evt.agentId,
          toolId: evt.toolId,
          name: evt.name,
          input: evt.input,
          inputPartial: '',
          status: 'running',
        }
        blocks.push(block)
        toolBlockIndex.set(evt.toolId, blocks.length - 1)
        break
      }
      case 'tool_input_delta': {
        const idx = toolBlockIndex.get(evt.toolId)
        if (idx === undefined) break
        const existing = blocks[idx]
        if (existing && existing.kind === 'tool') {
          existing.inputPartial += evt.deltaJson
        }
        break
      }
      case 'tool_result': {
        const idx = toolBlockIndex.get(evt.toolId)
        if (idx === undefined) break
        const existing = blocks[idx]
        if (existing && existing.kind === 'tool') {
          existing.status = evt.isError ? 'error' : 'done'
          existing.output = evt.output
          // Streaming partial is irrelevant once the tool has returned.
          existing.inputPartial = ''
        }
        break
      }
      case 'error': {
        const block: ErrorBlock = {
          kind: 'error',
          key: `err-${evt.seq}`,
          agentId: evt.agentId,
          source: evt.source,
          message: evt.message,
        }
        if (evt.detail) block.detail = evt.detail
        blocks.push(block)
        break
      }
      case 'session_id':
        // Journal-only; no render block.
        break
    }
  }

  return blocks
}

export function EventStreamRenderer({
  events,
  isRunning,
  className,
}: EventStreamRendererProps) {
  const blocks = useMemo(() => reduceEventsToBlocks(events), [events])
  const { scrollRef, isAtBottom, jumpToBottom } = useStickToBottom([
    blocks.length,
    // Re-evaluate at-bottom when the most recent message text grows so
    // streaming character deltas keep the feed pinned.
    blocks[blocks.length - 1]?.kind === 'message'
      ? (blocks[blocks.length - 1] as MessageBlock).text.length
      : 0,
  ])

  return (
    // `flex flex-col` lets the inner scroll div take the leftover height
    // bounded by `className`'s max-h. Without flex, `h-full` on the inner
    // collapses to content height (parent has no fixed height — only
    // a max-height — so the child has nothing to fill), and overflow-y-auto
    // never activates. `min-h-0` on the scroll child overrides the default
    // `min-height: auto` of flex children, which is what enables the
    // overflow to actually clip and scroll.
    <div className={cn('relative flex flex-col overflow-hidden', className)}>
      <div
        ref={scrollRef}
        className={cn(
          'min-h-0 flex-1 overflow-y-auto',
          // When the panel is empty we want the empty state vertically
          // centered. With content, the px-4/py-3 padding governs.
          blocks.length === 0
            ? 'flex items-center justify-center px-6 py-10'
            : 'px-4 py-3',
        )}
        role="log"
        aria-live="polite"
        aria-relevant="additions"
      >
        {blocks.length === 0 ? (
          <EmptyState isRunning={isRunning} />
        ) : (
          <BlocksList blocks={blocks} />
        )}
        {isRunning && blocks.length > 0 && (
          <span
            aria-hidden
            className="ml-1 inline-block h-3 w-[2px] animate-pulse bg-indigo-400 align-middle dark:bg-indigo-500"
          />
        )}
      </div>

      {/* Earned: only appears once the user has scrolled away. */}
      {!isAtBottom && (
        <button
          type="button"
          onClick={jumpToBottom}
          className={cn(
            'absolute bottom-3 left-1/2 -translate-x-1/2',
            'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-medium',
            'bg-zinc-900/90 text-white shadow-lg backdrop-blur transition-colors',
            'hover:bg-zinc-900 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white',
          )}
        >
          <ArrowDown aria-hidden className="h-3 w-3" />
          Jump to live
        </button>
      )}
    </div>
  )
}

/**
 * Empty state for the timeline.
 *
 * Two modes:
 *   • `isRunning` — workflow has spawned but stdout hasn't yielded its
 *     first parsable line yet. Shows a quiet pulsing icon, a primary
 *     line that reads as a state ("Spinning up the orchestrator"), and
 *     a secondary microcopy that sets expectations.
 *   • `!isRunning` — terminal/historical state with no captured events
 *     (utility command, run before timeline shipped, or stream errored
 *     before emitting anything). Shows a different icon and a single
 *     factual line.
 *
 * Centered, generous breathing room, matches the rest of the dashboard's
 * empty-state vocabulary instead of the previous bare-paragraph dump.
 */
function EmptyState({ isRunning }: { isRunning: boolean }) {
  if (isRunning) {
    return (
      <div className="flex max-w-sm flex-col items-center gap-3 text-center">
        <span className="relative flex h-10 w-10 items-center justify-center">
          <span
            aria-hidden
            className="absolute inset-0 animate-ping rounded-full bg-indigo-400/30 dark:bg-indigo-500/20"
          />
          <span className="relative flex h-10 w-10 items-center justify-center rounded-full bg-indigo-500/10 dark:bg-indigo-500/15">
            <Sparkles className="h-4 w-4 text-indigo-500 dark:text-indigo-400" aria-hidden />
          </span>
        </span>
        <div className="space-y-1">
          <p className="text-sm font-medium text-zinc-700 dark:text-zinc-200">
            Spinning up the orchestrator
          </p>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            Tool calls and reviewer output will appear here as the
            workflow progresses. The first response usually arrives
            within a few seconds.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex max-w-sm flex-col items-center gap-3 text-center">
      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-zinc-100 dark:bg-zinc-800">
        <FileSearch className="h-4 w-4 text-zinc-400 dark:text-zinc-500" aria-hidden />
      </span>
      <div className="space-y-1">
        <p className="text-sm font-medium text-zinc-600 dark:text-zinc-300">
          No structured events captured
        </p>
        <p className="text-xs text-zinc-500 dark:text-zinc-500">
          This run completed without emitting timeline events. The
          legacy raw output may still contain its result.
        </p>
      </div>
    </div>
  )
}

/**
 * Wraps each block in an AgentRail, threading agent provenance through
 * the feed. The agent name shows in the gutter only when the previous
 * block was from a different agent — keeps the visual quiet when one
 * agent is producing many consecutive entries.
 */
function BlocksList({ blocks }: { blocks: Block[] }) {
  // Provenance rails earn their pixels only when there's more than one
  // agent in the stream. With a single orchestrator (the common case,
  // especially before sub-agents fan out), the "▼ Orchestrator" gutter
  // label is just chrome — there's no other agent to distinguish from.
  // We collapse the rail entirely in that case and render blocks plain.
  const distinctAgents = useMemo(() => {
    const ids = new Set<string>()
    for (const b of blocks) ids.add(b.agentId)
    return ids
  }, [blocks])
  const multiAgent = distinctAgents.size > 1

  if (!multiAgent) {
    return (
      <>
        {blocks.map((block) => (
          <Fragment key={block.key}>
            <BlockEntry block={block} />
          </Fragment>
        ))}
      </>
    )
  }

  return (
    <>
      {blocks.map((block, idx) => {
        const prev = idx > 0 ? blocks[idx - 1] : null
        const showName = !prev || prev.agentId !== block.agentId
        return (
          <Fragment key={block.key}>
            <AgentRail agentId={block.agentId} showName={showName}>
              <BlockEntry block={block} />
            </AgentRail>
          </Fragment>
        )
      })}
    </>
  )
}

function BlockEntry({ block }: { block: Block }) {
  switch (block.kind) {
    case 'message':
      return <MessageEntry text={block.text} />
    case 'thinking':
      return <ThinkingEntry text={block.text} />
    case 'tool': {
      const props: React.ComponentProps<typeof ToolEntry> = {
        name: block.name,
        toolId: block.toolId,
        input: block.input,
        status: block.status,
      }
      if (block.inputPartial) props.inputPartial = block.inputPartial
      if (block.output !== undefined) props.output = block.output
      return <ToolEntry {...props} />
    }
    case 'error': {
      const props: React.ComponentProps<typeof ErrorEntry> = {
        source: block.source,
        message: block.message,
      }
      if (block.detail) props.detail = block.detail
      return <ErrorEntry {...props} />
    }
  }
}
