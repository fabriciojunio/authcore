import { create } from 'zustand'
import { api } from '../services/api'

export interface AppNotification {
  id: string
  title: string
  message: string
  type: 'info' | 'success' | 'warning' | 'error'
  isRead: boolean
  createdAt: string
}

const DEMO_NOTIFICATIONS: AppNotification[] = [
  { id: 'n1', title: 'Novo usuário', message: 'alice@acme.com criou uma conta', type: 'success', isRead: false, createdAt: new Date().toISOString() },
  { id: 'n2', title: 'Alerta de segurança', message: '3 tentativas de login falharam', type: 'warning', isRead: false, createdAt: new Date().toISOString() },
  { id: 'n3', title: 'Sistema', message: 'Backup concluído com sucesso', type: 'info', isRead: true, createdAt: new Date().toISOString() },
]

interface NotificationState {
  notifications: AppNotification[]
  unreadCount: number
  isLoading: boolean
  addNotification: (n: Omit<AppNotification, 'isRead'>) => void
  markAsRead: (id: string) => void
  fetchNotifications: (isDemo?: boolean) => Promise<void>
}

export const useNotificationStore = create<NotificationState>((set) => ({
  notifications: [],
  unreadCount: 0,
  isLoading: false,

  addNotification: (n) => {
    const notification: AppNotification = { ...n, isRead: false }
    set((state) => ({
      notifications: [notification, ...state.notifications].slice(0, 50),
      unreadCount: state.unreadCount + 1,
    }))
  },

  markAsRead: (id) => {
    set((state) => ({
      notifications: state.notifications.map((n) => n.id === id ? { ...n, isRead: true } : n),
      unreadCount: Math.max(0, state.unreadCount - 1),
    }))
    void api.patch(`/notifications/${id}/read`).catch(() => null)
  },

  fetchNotifications: async (isDemo = false) => {
    if (isDemo) {
      set({ notifications: DEMO_NOTIFICATIONS, unreadCount: DEMO_NOTIFICATIONS.filter(n => !n.isRead).length })
      return
    }
    set({ isLoading: true })
    try {
      const res = await api.get('/notifications')
      const notifs = (res.data.data?.notifications as AppNotification[]) ?? []
      set({ notifications: notifs, unreadCount: notifs.filter(n => !n.isRead).length })
    } catch {
      // silently fail — notifications are non-critical
    } finally {
      set({ isLoading: false })
    }
  },

}))
