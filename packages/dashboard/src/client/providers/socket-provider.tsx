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
import { io, type Socket } from 'socket.io-client'
import { ensureAuthToken } from '../lib/auth'

type ConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'reconnecting'

type SocketContextValue = {
  socket: Socket | null
  status: ConnectionStatus
  isConnected: boolean
  joinRoom: (room: string) => void
  leaveRoom: (room: string) => void
}

const SocketContext = createContext<SocketContextValue | null>(null)

export function SocketProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<ConnectionStatus>('connecting')
  const socketRef = useRef<Socket | null>(null)
  const joinedRooms = useRef<Set<string>>(new Set())

  useEffect(() => {
    let cancelled = false

    ensureAuthToken().then((token) => {
      if (cancelled) return

      const socket = io({
        autoConnect: true,
        reconnection: true,
        reconnectionAttempts: Infinity,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        auth: { token },
      })

      socketRef.current = socket

      socket.on('connect', () => {
        setStatus('connected')
        // Rejoin rooms after reconnection
        for (const room of joinedRooms.current) {
          socket.emit('join:session', room)
        }
      })

      socket.on('disconnect', () => {
        setStatus('disconnected')
      })

      socket.io.on('reconnect_attempt', () => {
        setStatus('reconnecting')
      })
    })

    return () => {
      cancelled = true
      socketRef.current?.disconnect()
      socketRef.current = null
    }
  }, [])

  const joinRoom = useCallback((room: string) => {
    joinedRooms.current.add(room)
    socketRef.current?.emit('join:session', room)
  }, [])

  const leaveRoom = useCallback((room: string) => {
    joinedRooms.current.delete(room)
    socketRef.current?.emit('leave:session', room)
  }, [])

  const value = useMemo<SocketContextValue>(
    () => ({
      socket: socketRef.current,
      status,
      isConnected: status === 'connected',
      joinRoom,
      leaveRoom,
    }),
    [status, joinRoom, leaveRoom],
  )

  return <SocketContext value={value}>{children}</SocketContext>
}

export function useSocket(): SocketContextValue {
  const ctx = useContext(SocketContext)
  if (!ctx) throw new Error('useSocket must be used within SocketProvider')
  return ctx
}

export function useSocketEvent<T = unknown>(
  event: string,
  handler: (data: T) => void,
) {
  const { socket } = useSocket()
  const handlerRef = useRef(handler)
  handlerRef.current = handler

  useEffect(() => {
    if (!socket) return
    const listener = (data: T) => handlerRef.current(data)
    socket.on(event, listener)
    return () => {
      socket.off(event, listener)
    }
  }, [socket, event])
}
