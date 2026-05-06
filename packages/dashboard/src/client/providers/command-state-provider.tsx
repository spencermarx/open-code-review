/**
 * Global command execution state with multi-tab support.
 *
 * Lives above the router so running-command state (output, tabs, etc.)
 * survives page navigation. Hydrates from GET /api/commands/active on mount
 * to handle page refreshes mid-command. Supports multiple concurrent
 * commands, each tracked as a separate tab.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { useSocket, useSocketEvent } from './socket-provider'
import { fetchApi } from '../lib/utils'
import type { CommandEventsResponse, StreamEvent } from '../lib/api-types'

export type TabStatus = 'running' | 'complete' | 'cancelled' | 'failed'

export type CommandTab = {
  executionId: number
  command: string
  /**
   * Legacy human-readable summary stream — populated from the
   * `command:output` socket channel and used by the existing
   * `WorkflowOutput` line-parser. Phase 3's renderer prefers `events`.
   */
  output: string
  /**
   * Typed event stream from the AI CLI adapter. Empty for non-AI
   * commands (utility subcommands like `state` or `progress`) and
   * for AI executions that predate the events feature. The Phase 3
   * `EventStreamRenderer` switches in only when this is non-empty.
   */
  events: StreamEvent[]
  status: TabStatus
  exitCode: number | null
  startedAt: string
}

type ActiveCommandsResponse = {
  running_count: number
  commands: Array<{
    execution_id: number
    command: string
    started_at: string
    output: string
  }>
}

type CommandStateContextValue = {
  tabs: CommandTab[]
  activeTabId: number | null
  runningCount: number
  isRunning: boolean
  setActiveTabId: (id: number) => void
  dismissTab: (id: number) => void
  cancelCommand: (executionId: number) => void
}

const CommandStateContext = createContext<CommandStateContextValue | null>(null)

export function CommandStateProvider({ children }: { children: ReactNode }) {
  const [tabMap, setTabMap] = useState<Map<number, CommandTab>>(new Map())
  const [activeTabId, setActiveTabId] = useState<number | null>(null)
  const hydratedRef = useRef(false)
  const { socket } = useSocket()

  // Derived values
  const tabs = useMemo(() => Array.from(tabMap.values()), [tabMap])
  const runningCount = useMemo(
    () => tabs.filter((t) => t.status === 'running').length,
    [tabs],
  )
  const isRunning = useMemo(() => runningCount > 0, [runningCount])

  // Hydrate from server on mount (page refresh mid-command)
  useEffect(() => {
    if (hydratedRef.current) return
    hydratedRef.current = true

    fetchApi<ActiveCommandsResponse>('/api/commands/active')
      .then((data) => {
        if (data.commands.length > 0) {
          const nextMap = new Map<number, CommandTab>()
          let lastId: number | null = null

          for (const cmd of data.commands) {
            nextMap.set(cmd.execution_id, {
              executionId: cmd.execution_id,
              command: cmd.command,
              output: cmd.output ?? '',
              events: [],
              status: 'running',
              exitCode: null,
              startedAt: cmd.started_at,
            })
            lastId = cmd.execution_id
          }

          setTabMap(nextMap)
          setActiveTabId(lastId)

          // Rehydrate the typed event stream for each running execution —
          // the live socket subscription only sees events from now forward,
          // and a page reload mid-run would otherwise show a partial
          // timeline. Errors are non-fatal: empty `events` falls back to
          // the legacy line-parser rendering.
          for (const cmd of data.commands) {
            fetchApi<CommandEventsResponse>(
              `/api/commands/${cmd.execution_id}/events`,
            )
              .then((eventsResp) => {
                if (!eventsResp.events || eventsResp.events.length === 0) return
                setTabMap((prev) => {
                  const existing = prev.get(cmd.execution_id)
                  if (!existing) return prev
                  // Don't clobber events received via the live socket while
                  // we were fetching — append-with-dedup by seq.
                  const seenSeqs = new Set(existing.events.map((e) => e.seq))
                  const merged = [...existing.events]
                  for (const evt of eventsResp.events) {
                    if (!seenSeqs.has(evt.seq)) merged.push(evt)
                  }
                  merged.sort((a, b) => a.seq - b.seq)
                  const next = new Map(prev)
                  next.set(cmd.execution_id, { ...existing, events: merged })
                  return next
                })
              })
              .catch(() => {
                /* non-fatal — falls back to legacy rendering */
              })
          }
        }
      })
      .catch(() => {
        // Non-fatal -- if hydration fails we start with empty state
      })
  }, [])

  // Socket listeners -- always active regardless of which page is mounted
  useSocketEvent<{ execution_id: number; command: string; started_at: string }>(
    'command:started',
    (data) => {
      const tab: CommandTab = {
        executionId: data.execution_id,
        command: data.command,
        output: '',
        events: [],
        status: 'running',
        exitCode: null,
        startedAt: data.started_at,
      }

      setTabMap((prev) => {
        const next = new Map(prev)
        next.set(data.execution_id, tab)
        return next
      })
      setActiveTabId(data.execution_id)
    },
  )

  useSocketEvent<{ execution_id: number; content: string }>(
    'command:output',
    (data) => {
      setTabMap((prev) => {
        const existing = prev.get(data.execution_id)
        if (!existing) return prev

        const next = new Map(prev)
        next.set(data.execution_id, {
          ...existing,
          output: existing.output + data.content,
        })
        return next
      })
    },
  )

  // Live typed event stream from command-runner. The payload's `executionId`
  // (camelCase) is set by command-runner — distinct from the snake_case
  // `execution_id` used by the legacy channels.
  useSocketEvent<StreamEvent>('command:event', (evt) => {
    setTabMap((prev) => {
      const existing = prev.get(evt.executionId)
      if (!existing) return prev
      // Drop duplicate seqs that may arrive if the socket reconnects mid-flight.
      if (existing.events.some((e) => e.seq === evt.seq)) return prev
      const next = new Map(prev)
      next.set(evt.executionId, {
        ...existing,
        events: [...existing.events, evt],
      })
      return next
    })
  })

  useSocketEvent<{ execution_id: number; exitCode: number }>(
    'command:finished',
    (data) => {
      setTabMap((prev) => {
        const existing = prev.get(data.execution_id)
        if (!existing) return prev

        const next = new Map(prev)
        next.set(data.execution_id, {
          ...existing,
          status: data.exitCode === -2 ? 'cancelled' : data.exitCode === 0 ? 'complete' : 'failed',
          exitCode: data.exitCode,
        })
        return next
      })
    },
  )

  // Actions
  const dismissTab = useCallback(
    (id: number) => {
      setTabMap((prev) => {
        const next = new Map(prev)
        next.delete(id)

        // Compute the next active tab from the updated map (not a stale closure)
        setActiveTabId((prevActive) => {
          if (prevActive !== id) return prevActive
          const remaining = Array.from(next.keys())
          return remaining.length > 0 ? remaining[remaining.length - 1]! : null
        })

        return next
      })
    },
    [],
  )

  const cancelCommand = useCallback(
    (executionId: number) => {
      socket?.emit('command:cancel', { execution_id: executionId })
    },
    [socket],
  )

  const value = useMemo<CommandStateContextValue>(
    () => ({
      tabs,
      activeTabId,
      runningCount,
      isRunning,
      setActiveTabId,
      dismissTab,
      cancelCommand,
    }),
    [tabs, activeTabId, runningCount, isRunning, dismissTab, cancelCommand],
  )

  return (
    <CommandStateContext value={value}>
      {children}
    </CommandStateContext>
  )
}

export function useCommandState(): CommandStateContextValue {
  const ctx = useContext(CommandStateContext)
  if (!ctx) throw new Error('useCommandState must be used within CommandStateProvider')
  return ctx
}
