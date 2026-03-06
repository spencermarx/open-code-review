/**
 * Socket.IO event handlers with room-scoped session messaging.
 */

import type { Server as SocketIOServer, Socket } from 'socket.io'

/**
 * Registers socket event handlers for a connected client.
 */
export function registerSocketHandlers(io: SocketIOServer, socket: Socket): void {
  socket.on('join:session', (sessionId: unknown) => {
    try {
      if (typeof sessionId !== 'string') {
        socket.emit('error', { message: 'Invalid payload: sessionId must be a string' })
        return
      }
      const room = `session:${sessionId}`
      void socket.join(room)
    } catch (err) {
      console.error('Error in join:session handler:', err)
      socket.emit('error', { message: 'Internal error' })
    }
  })

  socket.on('leave:session', (sessionId: unknown) => {
    try {
      if (typeof sessionId !== 'string') {
        socket.emit('error', { message: 'Invalid payload: sessionId must be a string' })
        return
      }
      const room = `session:${sessionId}`
      void socket.leave(room)
    } catch (err) {
      console.error('Error in leave:session handler:', err)
      socket.emit('error', { message: 'Internal error' })
    }
  })
}

/**
 * Emit an event to all clients watching a specific session.
 */
export function emitToSession(
  io: SocketIOServer,
  sessionId: string,
  event: string,
  data: unknown
): void {
  io.to(`session:${sessionId}`).emit(event, data)
}

/**
 * Emit an event to all connected clients.
 */
export function emitGlobal(
  io: SocketIOServer,
  event: string,
  data: unknown
): void {
  io.emit(event, data)
}
