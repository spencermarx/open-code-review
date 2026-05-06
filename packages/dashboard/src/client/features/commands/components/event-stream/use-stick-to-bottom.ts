/**
 * Sticky-scroll hook for live feeds.
 *
 * Auto-scrolls a container to the bottom whenever its content grows —
 * BUT only while the user is already at (or near) the bottom. If the
 * user scrolls up to read something older, sticky pauses; the
 * `isStuckToBottom` flag flips to false and the consumer can render a
 * "Jump to live" pill.
 *
 * Behavior matches the idiom every chat client and terminal multiplexer
 * uses — auto-follow unless I'm reading.
 *
 * Usage:
 *   const { scrollRef, isAtBottom, jumpToBottom } = useStickToBottom([
 *     events,
 *     legacyOutput,
 *   ])
 *
 * Pass any reactive values that grow on stream as deps. Whenever they
 * change AND we're at-bottom, the container scrolls to the new bottom.
 */

import { useCallback, useEffect, useRef, useState } from 'react'

const NEAR_BOTTOM_PX = 24

type UseStickToBottomReturn = {
  scrollRef: React.RefObject<HTMLDivElement | null>
  isAtBottom: boolean
  jumpToBottom: () => void
}

export function useStickToBottom(deps: unknown[]): UseStickToBottomReturn {
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const [isAtBottom, setIsAtBottom] = useState(true)

  // Track the at-bottom state on every user scroll. Using ref to avoid
  // re-creating the listener on every state change.
  const isAtBottomRef = useRef(true)
  isAtBottomRef.current = isAtBottom

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const onScroll = (): void => {
      const distance = el.scrollHeight - el.scrollTop - el.clientHeight
      const atBottom = distance <= NEAR_BOTTOM_PX
      if (atBottom !== isAtBottomRef.current) {
        setIsAtBottom(atBottom)
      }
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => el.removeEventListener('scroll', onScroll)
  }, [])

  // Auto-scroll on dep change — only when the user hasn't scrolled away.
  useEffect(() => {
    if (!isAtBottomRef.current) return
    const el = scrollRef.current
    if (!el) return
    // Schedule on next frame so the DOM has flushed the new content's
    // scrollHeight before we read/set it. Avoids one-frame jitter.
    requestAnimationFrame(() => {
      if (!isAtBottomRef.current) return
      el.scrollTop = el.scrollHeight
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  const jumpToBottom = useCallback((): void => {
    const el = scrollRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
    setIsAtBottom(true)
  }, [])

  return { scrollRef, isAtBottom, jumpToBottom }
}
