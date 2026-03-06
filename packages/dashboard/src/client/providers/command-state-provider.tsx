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

export type TabStatus = 'running' | 'complete' | 'cancelled' | 'failed'

export type CommandTab = {
  executionId: number
  command: string
  output: string
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
              status: 'running',
              exitCode: null,
              startedAt: cmd.started_at,
            })
            lastId = cmd.execution_id
          }

          setTabMap(nextMap)
          setActiveTabId(lastId)
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
