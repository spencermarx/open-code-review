/**
 * Chat REST endpoints.
 *
 * Provides HTTP access to chat conversation history and management.
 */

import { Router } from 'express'
import type { Database } from 'sql.js'
import {
  getSession,
  getConversation,
  getConversationsForSession,
  getMessages,
  deleteConversation,
  saveDb,
} from '../db.js'

export function createChatRouter(db: Database, ocrDir: string): Router {
  const router = Router()

  // GET /api/sessions/:id/chat — List all conversations for a session
  router.get('/:id/chat', (req, res) => {
    try {
      const sessionId = req.params['id'] as string
      const session = getSession(db, sessionId)
      if (!session) {
        res.status(404).json({ error: 'Session not found' })
        return
      }

      const conversations = getConversationsForSession(db, sessionId)
      res.json(conversations)
    } catch (err) {
      console.error('Failed to fetch conversations:', err)
      res.status(500).json({ error: 'Failed to fetch conversations' })
    }
  })

  // GET /api/sessions/:id/chat/:conversationId — Get conversation with messages
  router.get('/:id/chat/:conversationId', (req, res) => {
    try {
      const sessionId = req.params['id'] as string
      const conversationId = req.params['conversationId'] as string

      const session = getSession(db, sessionId)
      if (!session) {
        res.status(404).json({ error: 'Session not found' })
        return
      }

      const conversation = getConversation(db, conversationId)
      if (!conversation || conversation.session_id !== sessionId) {
        res.status(404).json({ error: 'Conversation not found' })
        return
      }

      const messages = getMessages(db, conversationId)
      res.json({ ...conversation, messages })
    } catch (err) {
      console.error('Failed to fetch conversation:', err)
      res.status(500).json({ error: 'Failed to fetch conversation' })
    }
  })

  // DELETE /api/sessions/:id/chat/:conversationId — Delete a conversation
  router.delete('/:id/chat/:conversationId', (req, res) => {
    try {
      const sessionId = req.params['id'] as string
      const conversationId = req.params['conversationId'] as string

      const session = getSession(db, sessionId)
      if (!session) {
        res.status(404).json({ error: 'Session not found' })
        return
      }

      const conversation = getConversation(db, conversationId)
      if (!conversation || conversation.session_id !== sessionId) {
        res.status(404).json({ error: 'Conversation not found' })
        return
      }

      deleteConversation(db, conversationId)
      saveDb(db, ocrDir)
      res.status(200).json({ deleted: true })
    } catch (err) {
      console.error('Failed to delete conversation:', err)
      res.status(500).json({ error: 'Failed to delete conversation' })
    }
  })

  return router
}
