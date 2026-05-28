import { create } from 'zustand'
import { api, setTokens, clearTokens } from '../services/api'

export interface AuthUser {
  id: string
  name: string
  email: string
  role: string
  status: string
}

const DEMO_USER: AuthUser = {
  id: 'demo-01',
  name: 'System Admin',
  email: 'demo@enterprise.com',
  role: 'admin',
  status: 'active',
}

interface AuthState {
  user: AuthUser | null
  isAuthenticated: boolean
  isDemo: boolean
  isLoading: boolean
  error: string | null
  login: (email: string, password: string) => Promise<void>
  loginAsDemo: () => void
  register: (name: string, email: string, password: string) => Promise<void>
  logout: () => Promise<void>
  clearError: () => void
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isAuthenticated: false,
  isDemo: false,
  isLoading: false,
  error: null,

  login: async (email, password) => {
    // Modo demonstração: qualquer senha "demo" ou email demo@enterprise.com
    if (email === 'demo@enterprise.com' || password === 'demo') {
      set({ user: DEMO_USER, isAuthenticated: true, isDemo: true, isLoading: false, error: null })
      return
    }

    set({ isLoading: true, error: null })
    try {
      const res = await api.post('/auth/login', { email, password })
      const { user, tokens } = res.data.data
      setTokens(tokens.accessToken, tokens.refreshToken)
      set({ user, isAuthenticated: true, isDemo: false, isLoading: false })
    } catch (err: unknown) {
      const e = err as { message?: string }
      set({ error: e?.message ?? 'Credenciais inválidas', isLoading: false })
      throw err
    }
  },

  loginAsDemo: () => {
    set({ user: DEMO_USER, isAuthenticated: true, isDemo: true, isLoading: false, error: null })
  },

  register: async (name, email, password) => {
    set({ isLoading: true, error: null })
    try {
      const res = await api.post('/auth/register', { name, email, password })
      const { user, tokens } = res.data.data
      setTokens(tokens.accessToken, tokens.refreshToken)
      set({ user, isAuthenticated: true, isDemo: false, isLoading: false })
    } catch (err: unknown) {
      const e = err as { message?: string }
      set({ error: e?.message ?? 'Erro ao criar conta', isLoading: false })
      throw err
    }
  },

  logout: async () => {
    const { isDemo } = useAuthStore.getState()
    try {
      if (!isDemo) await api.post('/auth/logout')
    } finally {
      clearTokens()
      set({ user: null, isAuthenticated: false, isDemo: false, error: null })
    }
  },

  clearError: () => set({ error: null }),
}))
