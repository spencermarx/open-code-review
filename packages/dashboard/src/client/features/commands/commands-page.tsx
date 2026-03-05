import { useCallback, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useSocket, useSocketEvent } from '../../providers/socket-provider'
import { useCommandState } from '../../providers/command-state-provider'
import { CommandPalette, parseCommandString, type ParsedCommand } from './components/command-palette'
import { WorkflowOutput } from './components/workflow-output'
import { CommandHistory } from './components/command-history'
import { TabBar } from './components/tab-bar'

export function CommandsPage() {
  const { socket } = useSocket()
  const queryClient = useQueryClient()
  const {
    tabs,
    activeTabId,
    runningCount,
    setActiveTabId,
    dismissTab,
    cancelCommand,
  } = useCommandState()

  const activeTab = tabs.find((t) => t.executionId === activeTabId) ?? null
  const [prefill, setPrefill] = useState<ParsedCommand | null>(null)
  const paletteRef = useRef<HTMLDivElement>(null)

  // Invalidate command history when ANY command finishes
  useSocketEvent('command:finished', () => {
    queryClient.invalidateQueries({ queryKey: ['command-history'] })
  })

  const handleRunCommand = useCallback(
    (command: string) => {
      if (!socket) return
      socket.emit('command:run', { command })
    },
    [socket],
  )

  const handleCancel = useCallback(() => {
    if (activeTab && activeTab.status === 'running') {
      cancelCommand(activeTab.executionId)
    }
  }, [activeTab, cancelCommand])

  const handleRerun = useCallback(
    (commandStr: string) => {
      const parsed = parseCommandString(commandStr)
      if (parsed) {
        setPrefill(parsed)
        paletteRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }
    },
    [],
  )

  const handlePrefillConsumed = useCallback(() => {
    setPrefill(null)
  }, [])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Command Center</h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Launch AI-powered code review workflows.
        </p>
      </div>

      <div ref={paletteRef}>
        <CommandPalette
          isRunning={false}
          runningCount={runningCount}
          onRunCommand={handleRunCommand}
          prefill={prefill}
          onPrefillConsumed={handlePrefillConsumed}
        />
      </div>

      {/* Tabbed output area */}
      {tabs.length > 0 && (
        <div className="overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-800">
          <TabBar
            tabs={tabs}
            activeTabId={activeTabId}
            onSelectTab={setActiveTabId}
            onDismissTab={dismissTab}
          />
          {activeTab && (
            <WorkflowOutput
              bare
              output={activeTab.output}
              isRunning={activeTab.status === 'running'}
              exitCode={activeTab.exitCode}
              commandName={activeTab.command}
              onCancel={handleCancel}
            />
          )}
        </div>
      )}

      <CommandHistory isRunning={false} onRerun={handleRerun} />
    </div>
  )
}
