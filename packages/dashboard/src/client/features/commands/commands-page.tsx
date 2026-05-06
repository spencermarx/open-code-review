import { useCallback, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Terminal } from 'lucide-react'
import { useSocket, useSocketEvent } from '../../providers/socket-provider'
import { useCommandState } from '../../providers/command-state-provider'
import { useAiCli } from '../../hooks/use-ai-cli'
import { CommandPalette, parseCommandString, type ParsedCommand } from './components/command-palette'
import { WorkflowOutput } from './components/workflow-output'
import { CommandHistory } from './components/command-history'
import { TabBar } from './components/tab-bar'

const CLI_DISPLAY_NAMES: Record<string, string> = {
  claude: 'Claude Code',
  opencode: 'OpenCode',
}

export function CommandsPage() {
  const { socket } = useSocket()
  const queryClient = useQueryClient()
  const { isAvailable, activeCli, isDisabledByConfig } = useAiCli()
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
          {activeCli && (
            <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-zinc-100 px-2.5 py-0.5 text-[10px] font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
              Using {CLI_DISPLAY_NAMES[activeCli] ?? activeCli}
            </span>
          )}
        </p>
      </div>

      {!isAvailable ? (
        <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-6 dark:border-zinc-800 dark:bg-zinc-900/50">
          <div className="flex items-start gap-3">
            <Terminal className="mt-0.5 h-5 w-5 shrink-0 text-zinc-400" />
            <div>
              <h3 className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                {isDisabledByConfig ? 'AI Commands Disabled' : 'AI CLI Required'}
              </h3>
              <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                {isDisabledByConfig ? (
                  <>
                    AI commands are turned off in your project config.
                    Set <code className="rounded bg-zinc-200 px-1 py-0.5 text-xs dark:bg-zinc-800">ai_cli</code> to{' '}
                    <code className="rounded bg-zinc-200 px-1 py-0.5 text-xs dark:bg-zinc-800">auto</code>,{' '}
                    <code className="rounded bg-zinc-200 px-1 py-0.5 text-xs dark:bg-zinc-800">claude</code>, or{' '}
                    <code className="rounded bg-zinc-200 px-1 py-0.5 text-xs dark:bg-zinc-800">opencode</code>{' '}
                    in <code className="rounded bg-zinc-200 px-1 py-0.5 text-xs dark:bg-zinc-800">.ocr/config.yaml</code> to
                    enable them.
                  </>
                ) : (
                  <>
                    Install{' '}
                    <a
                      href="https://docs.anthropic.com/en/docs/claude-code/getting-started"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-medium text-indigo-600 hover:text-indigo-500 dark:text-indigo-400"
                    >
                      Claude Code
                    </a>
                    {' '}or{' '}
                    <a
                      href="https://opencode.ai"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-medium text-indigo-600 hover:text-indigo-500 dark:text-indigo-400"
                    >
                      OpenCode
                    </a>
                    {' '}to run AI-powered review commands from the dashboard.
                  </>
                )}
              </p>
              <p className="mt-2 text-xs text-zinc-400 dark:text-zinc-500">
                You can still use OCR slash commands directly from your IDE, and browse
                existing sessions, reviews, and maps below.
              </p>
            </div>
          </div>
        </div>
      ) : (
        <div ref={paletteRef}>
          <CommandPalette
            isRunning={false}
            runningCount={runningCount}
            onRunCommand={handleRunCommand}
            prefill={prefill}
            onPrefillConsumed={handlePrefillConsumed}
          />
        </div>
      )}

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
              events={activeTab.events}
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
