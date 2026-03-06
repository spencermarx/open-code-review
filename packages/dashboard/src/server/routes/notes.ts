/**
 * Notes CRUD endpoints.
 */

import { Router } from 'express'
import type { Database } from 'sql.js'
import {
  getNotes,
  getNote,
  insertNote,
  updateNote,
  deleteNote,
  saveDb,
  type NoteRow,
} from '../db.js'

const VALID_TARGET_TYPES = new Set<NoteRow['target_type']>([
  'session',
  'round',
  'finding',
  'run',
  'section',
  'file',
])

export function createNotesRouter(db: Database, ocrDir: string): Router {
  const router = Router()

  // GET /api/notes?target_type=...&target_id=... — Get notes for target
  router.get('/', (req, res) => {
    try {
      const targetType = req.query['target_type'] as string | undefined
      const targetId = req.query['target_id'] as string | undefined

      if (!targetType || !targetId) {
        res.status(400).json({ error: 'target_type and target_id are required' })
        return
      }

      if (!VALID_TARGET_TYPES.has(targetType as NoteRow['target_type'])) {
        res.status(400).json({
          error: 'Invalid target_type',
          valid_types: [...VALID_TARGET_TYPES],
        })
        return
      }

      const notes = getNotes(db, targetType as NoteRow['target_type'], targetId)
      res.json(notes)
    } catch (err) {
      console.error('Failed to fetch notes:', err)
      res.status(500).json({ error: 'Failed to fetch notes' })
    }
  })

  // POST /api/notes — Create note
  router.post('/', (req, res) => {
    try {
      const { target_type, target_id, content } = req.body as {
        target_type?: string
        target_id?: string
        content?: string
      }

      if (!target_type || !target_id || !content) {
        res.status(400).json({ error: 'target_type, target_id, and content are required' })
        return
      }

      if (!VALID_TARGET_TYPES.has(target_type as NoteRow['target_type'])) {
        res.status(400).json({
          error: 'Invalid target_type',
          valid_types: [...VALID_TARGET_TYPES],
        })
        return
      }

      const noteId = insertNote(db, target_type as NoteRow['target_type'], target_id, content)
      saveDb(db, ocrDir)

      const note = getNote(db, noteId)
      res.status(201).json(note)
    } catch (err) {
      console.error('Failed to create note:', err)
      res.status(500).json({ error: 'Failed to create note' })
    }
  })

  // PATCH /api/notes/:id — Update note
  router.patch('/:id', (req, res) => {
    try {
      const noteId = parseInt(req.params['id'] as string, 10)
      if (isNaN(noteId)) {
        res.status(400).json({ error: 'Invalid note ID' })
        return
      }

      const existing = getNote(db, noteId)
      if (!existing) {
        res.status(404).json({ error: 'Note not found' })
        return
      }

      const { content } = req.body as { content?: string }
      if (!content) {
        res.status(400).json({ error: 'content is required' })
        return
      }

      updateNote(db, noteId, content)
      saveDb(db, ocrDir)

      const note = getNote(db, noteId)
      res.json(note)
    } catch (err) {
      console.error('Failed to update note:', err)
      res.status(500).json({ error: 'Failed to update note' })
    }
  })

  // DELETE /api/notes/:id — Delete note
  router.delete('/:id', (req, res) => {
    try {
      const noteId = parseInt(req.params['id'] as string, 10)
      if (isNaN(noteId)) {
        res.status(400).json({ error: 'Invalid note ID' })
        return
      }

      const existing = getNote(db, noteId)
      if (!existing) {
        res.status(404).json({ error: 'Note not found' })
        return
      }

      deleteNote(db, noteId)
      saveDb(db, ocrDir)
      res.status(200).json({ deleted: true })
    } catch (err) {
      console.error('Failed to delete note:', err)
      res.status(500).json({ error: 'Failed to delete note' })
    }
  })

  return router
}
