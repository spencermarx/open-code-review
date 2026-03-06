/**
 * Shared execution tracking for all AI operations.
 *
 * Provides a consistent way to log any AI CLI operation (commands, chat,
 * post-to-GitHub) into the command_executions table and emit lifecycle
 * events so the dashboard's CommandStateProvider can track them in the
 * active commands tab bar and history.
 */

import type { Server as SocketIOServer } from 'socket.io'
import type { Database } from 'sql.js'
import { saveDb } from '../db.js'

export type TrackedExecution = {
  executionId: number
  /** Append text to the output buffer and emit `command:output`. */
  appendOutput: (content: string) => void
  /** Store the child process PID so orphans can be detected after restart. */
  setPid: (pid: number, isDetached: boolean) => void
  /** Finalize the execution record and emit `command:finished`. */
  finish: (exitCode: number | null) => void
}

/**
 * Start tracking an execution.
 *
 * Inserts a row into `command_executions`, emits `command:started`,
 * and returns helpers to stream output and finalize.
 */
export function startTrackedExecution(
  io: SocketIOServer,
  db: Database,
  ocrDir: string,
  command: string,
  args: string[] = [],
): TrackedExecution {
  const startedAt = new Date().toISOString()

  db.run(
    `INSERT INTO command_executions (command, args, started_at)
     VALUES (?, ?, ?)`,
    [command, JSON.stringify(args), startedAt],
  )
  const idResult = db.exec('SELECT last_insert_rowid() as id')
  const executionId = (idResult[0]?.values[0]?.[0] as number) ?? 0

  io.emit('command:started', {
    execution_id: executionId,
    command,
    args,
    started_at: startedAt,
  })

  let outputBuffer = ''

  return {
    executionId,

    appendOutput(content: string) {
      outputBuffer += content
      io.emit('command:output', { execution_id: executionId, content })
    },

    setPid(pid: number, isDetached: boolean) {
      db.run(
        'UPDATE command_executions SET pid = ?, is_detached = ? WHERE id = ?',
        [pid, isDetached ? 1 : 0, executionId],
      )
    },

    finish(exitCode: number | null) {
      const finishedAt = new Date().toISOString()

      // Clear PID so completed commands aren't mistaken for orphans
      db.run(
        `UPDATE command_executions
         SET exit_code = ?, finished_at = ?, output = ?, pid = NULL
         WHERE id = ?`,
        [exitCode, finishedAt, outputBuffer, executionId],
      )
      saveDb(db, ocrDir)

      io.emit('command:finished', {
        execution_id: executionId,
        exitCode,
        finished_at: finishedAt,
      })
    },
  }
}
