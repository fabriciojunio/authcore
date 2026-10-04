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
  email: 'demo@authcore.dev',
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

/**
 * Confere a forma da resposta antes de confiar nela.
 *
 * Sem isto, uma resposta 200 com corpo fora do contrato fazia o
 * desestruturamento lancar TypeError dentro do `try`, o `catch` tratava como
 * falha de credencial e a tela exibia "Cannot read properties of undefined
 * (reading 'accessToken')" para o usuario. Erro de JavaScript na tela de login
 * nao diz nada a quem esta tentando entrar, e diz demais a quem esta olhando.
 */
function lerSessao(corpo: unknown): { user: AuthUser; tokens: { accessToken: string; refreshToken: string } } {
  const dados = (corpo as { data?: { data?: unknown } })?.data?.data as
    | { user?: AuthUser; tokens?: { accessToken?: string; refreshToken?: string } }
    | undefined

  const user = dados?.user
  const accessToken = dados?.tokens?.accessToken
  const refreshToken = dados?.tokens?.refreshToken

  if (!user || !accessToken || !refreshToken) {
    throw { message: 'Resposta inesperada do servidor', code: 'RESPOSTA_INVALIDA' }
  }
  return { user, tokens: { accessToken, refreshToken } }
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isAuthenticated: false,
  isDemo: false,
  isLoading: false,
  error: null,

  login: async (email, password) => {
    // Modo demonstração: qualquer senha "demo" ou email demo@authcore.dev
    if (email === 'demo@authcore.dev' || password === 'demo') {
      set({ user: DEMO_USER, isAuthenticated: true, isDemo: true, isLoading: false, error: null })
      return
    }

    set({ isLoading: true, error: null })
    try {
      const { user, tokens } = lerSessao(await api.post('/auth/login', { email, password }))
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
      const { user, tokens } = lerSessao(
        await api.post('/auth/register', { name, email, password }),
      )
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
    } catch {
      // Sair nunca falha. A revogacao no servidor e desejavel, mas o estado
      // local ja foi derrubado logo abaixo: repropagar o erro deixaria a tela
      // com uma promessa recusada e sem ninguem para tratar, e o usuario
      // continuaria vendo a sessao como valida.
    } finally {
      clearTokens()
      set({ user: null, isAuthenticated: false, isDemo: false, error: null })
    }
  },

  clearError: () => set({ error: null }),
}))
