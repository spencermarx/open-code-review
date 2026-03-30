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
import {
  generateCommandUid,
  appendCommandLog,
  type CommandLogEntry,
} from '@open-code-review/cli/db'

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
  const uid = generateCommandUid()
  const argsJson = JSON.stringify(args)

  db.run(
    `INSERT INTO command_executions (uid, command, args, started_at)
     VALUES (?, ?, ?, ?)`,
    [uid, command, argsJson, startedAt],
  )
  const idResult = db.exec('SELECT last_insert_rowid() as id')
  const executionId = (idResult[0]?.values[0]?.[0] as number) ?? 0

  // Best-effort JSONL backup
  const baseLogEntry: Omit<CommandLogEntry, 'event' | 'exit_code' | 'finished_at'> = {
    v: 1,
    uid,
    db_id: executionId,
    command,
    args: argsJson,
    started_at: startedAt,
    is_detached: 0,
    writer: 'dashboard',
  }
  appendCommandLog(ocrDir, { ...baseLogEntry, event: 'start', exit_code: null, finished_at: null })

  io.emit('command:started', {
    execution_id: executionId,
    command,
    args,
    started_at: startedAt,
  })

  let outputBuffer = ''
  let trackedIsDetached = 0

  return {
    executionId,

    appendOutput(content: string) {
      outputBuffer += content
      io.emit('command:output', { execution_id: executionId, content })
    },

    setPid(pid: number, isDetached: boolean) {
      trackedIsDetached = isDetached ? 1 : 0
      db.run(
        'UPDATE command_executions SET pid = ?, is_detached = ? WHERE id = ?',
        [pid, trackedIsDetached, executionId],
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

      // Best-effort JSONL backup
      appendCommandLog(ocrDir, {
        ...baseLogEntry,
        is_detached: trackedIsDetached,
        event: exitCode === -2 ? 'cancel' : 'finish',
        exit_code: exitCode,
        finished_at: finishedAt,
      })

      io.emit('command:finished', {
        execution_id: executionId,
        exitCode,
        finished_at: finishedAt,
      })
    },
  }
}
