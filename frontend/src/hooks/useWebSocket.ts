import { useEffect, useRef, useCallback } from 'react'
import { io, Socket } from 'socket.io-client'
import { useAuthStore } from '../store/authStore'
import { useNotificationStore } from '../store/notificationStore'
import type { AppNotification } from '../store/notificationStore'

const WS_URL = import.meta.env.VITE_WS_URL ?? ''

export enum WsEvent {
  NOTIFICATION     = 'notification',
  USER_UPDATED     = 'user:updated',
  USER_DELETED     = 'user:deleted',
  PRESENCE_ONLINE  = 'presence:online',
  PRESENCE_OFFLINE = 'presence:offline',
  PING             = 'ping',
  PONG             = 'pong',
  MARK_READ        = 'notification:read',
}

let socketInstance: Socket | null = null

export function useWebSocket() {
  const socketRef = useRef<Socket | null>(null)
  const isAuth    = useAuthStore((s) => s.isAuthenticated)
  const isDemo    = useAuthStore((s) => s.isDemo)
  const { addNotification } = useNotificationStore()

  const getToken = useCallback(() => sessionStorage.getItem('access_token') ?? '', [])

  useEffect(() => {
    if (!isAuth || isDemo) {
      socketInstance?.disconnect()
      socketInstance = null
      return
    }

    if (socketInstance?.connected) {
      socketRef.current = socketInstance
      return
    }

    const socket = io(WS_URL, {
      auth: { token: getToken() },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 10000,
    })

    socketInstance = socket
    socketRef.current = socket

    socket.on('connect', () => {})
    socket.on('disconnect', (_reason: string) => {})
    socket.on('connect_error', (_err: Error) => {})

    socket.on(WsEvent.NOTIFICATION, (data: {
      notification?: Omit<AppNotification, 'isRead'>
      notifications?: Array<Omit<AppNotification, 'isRead'>>
    }) => {
      const items = data.notifications ?? (data.notification ? [data.notification] : [])
      items.forEach(n => addNotification(n))
    })

    socket.on(WsEvent.PING, () => {
      socket.emit(WsEvent.PONG)
    })

    return () => {
      socket.off(WsEvent.NOTIFICATION)
      socket.off(WsEvent.PING)
      socket.off('connect')
      socket.off('disconnect')
      socket.off('connect_error')
    }
  }, [isAuth, isDemo, getToken, addNotification])

  const markRead = useCallback((notificationId: string) => {
    socketRef.current?.emit(WsEvent.MARK_READ, notificationId)
  }, [])

  const emit = useCallback((event: string, data?: unknown) => {
    socketRef.current?.emit(event, data)
  }, [])

  return {
    isConnected: socketRef.current?.connected ?? false,
    markRead,
    emit,
  }
}
