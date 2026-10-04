import { beforeEach, describe, expect, it, vi } from 'vitest'

// A camada de rede é dublada porque o que está sob teste é a regra de estado,
// não o axios. O dublê fica no topo porque os dois stores importam `api` no
// momento em que o módulo carrega.
vi.mock('../services/api', () => ({
  api: {
    post: vi.fn(() => Promise.resolve({ data: { data: {} } })),
    get: vi.fn(() => Promise.resolve({ data: { data: { notifications: [] } } })),
    patch: vi.fn(() => Promise.resolve({ data: {} })),
  },
  setTokens: vi.fn(),
  clearTokens: vi.fn(),
}))

import { api, clearTokens, setTokens } from '../services/api'
import { useAuthStore } from './authStore'
import { useNotificationStore, type AppNotification } from './notificationStore'

const naoLida = (id: string): Omit<AppNotification, 'isRead'> => ({
  id,
  title: `titulo ${id}`,
  message: `mensagem ${id}`,
  type: 'info',
  createdAt: new Date('2026-10-04T12:00:00Z').toISOString(),
})

beforeEach(() => {
  vi.clearAllMocks()
  sessionStorage.clear()
  useAuthStore.setState({
    user: null,
    isAuthenticated: false,
    isDemo: false,
    isLoading: false,
    error: null,
  })
  useNotificationStore.setState({ notifications: [], unreadCount: 0, isLoading: false })
})

describe('authStore', () => {
  it('o modo demonstração entra sem chamar a rede', async () => {
    await useAuthStore.getState().login('demo@authcore.dev', 'qualquer-coisa')

    const s = useAuthStore.getState()
    expect(s.isAuthenticated).toBe(true)
    expect(s.isDemo).toBe(true)
    expect(api.post).not.toHaveBeenCalled()
    expect(setTokens).not.toHaveBeenCalled()
  })

  it('a senha "demo" também entra em modo demonstração, com qualquer e-mail', async () => {
    // É deliberado: a demo existe para quem abre o link e não tem conta. Este
    // teste está aqui para que isso continue sendo uma decisão, e não um
    // acidente que alguém "corrige" sem perceber que derruba a demo.
    await useAuthStore.getState().login('alguem@exemplo.com', 'demo')

    expect(useAuthStore.getState().isDemo).toBe(true)
    expect(api.post).not.toHaveBeenCalled()
  })

  it('o login de verdade guarda os dois tokens e sai do modo demonstração', async () => {
    vi.mocked(api.post).mockResolvedValueOnce({
      data: {
        data: {
          user: { id: '1', name: 'Ana', email: 'ana@exemplo.com', role: 'user', status: 'active' },
          tokens: { accessToken: 'acesso', refreshToken: 'renovacao' },
        },
      },
    })

    await useAuthStore.getState().login('ana@exemplo.com', 'senha-correta')

    const s = useAuthStore.getState()
    expect(s.isAuthenticated).toBe(true)
    expect(s.isDemo).toBe(false)
    expect(s.user?.email).toBe('ana@exemplo.com')
    expect(setTokens).toHaveBeenCalledWith('acesso', 'renovacao')
  })

  it('credencial recusada guarda a mensagem do servidor e repropaga o erro', async () => {
    vi.mocked(api.post).mockRejectedValueOnce({ message: 'Senha incorreta' })

    await expect(
      useAuthStore.getState().login('ana@exemplo.com', 'errada'),
    ).rejects.toBeTruthy()

    const s = useAuthStore.getState()
    expect(s.error).toBe('Senha incorreta')
    expect(s.isAuthenticated).toBe(false)
    // isLoading tem de voltar para falso, senão o botão fica girando para sempre
    expect(s.isLoading).toBe(false)
  })

  it('erro sem mensagem cai num texto legível, e não em undefined', async () => {
    vi.mocked(api.post).mockRejectedValueOnce({})

    await expect(
      useAuthStore.getState().login('ana@exemplo.com', 'errada'),
    ).rejects.toBeTruthy()

    expect(useAuthStore.getState().error).toBe('Credenciais inválidas')
  })

  it('resposta 200 fora do contrato não vira erro de JavaScript na tela', async () => {
    // Era o defeito: com corpo inesperado, desestruturar `tokens.accessToken`
    // lançava TypeError dentro do try, o catch tratava como credencial
    // recusada, e a tela de login exibia "Cannot read properties of undefined
    // (reading 'accessToken')" para quem estava tentando entrar.
    vi.mocked(api.post).mockResolvedValueOnce({ data: { data: {} } })

    await expect(
      useAuthStore.getState().login('ana@exemplo.com', 'senha'),
    ).rejects.toBeTruthy()

    const s = useAuthStore.getState()
    expect(s.error).toBe('Resposta inesperada do servidor')
    expect(s.isAuthenticated).toBe(false)
    expect(setTokens).not.toHaveBeenCalled()
  })

  it('token faltando na resposta não autentica pela metade', async () => {
    vi.mocked(api.post).mockResolvedValueOnce({
      data: {
        data: {
          user: { id: '1', name: 'Ana', email: 'ana@exemplo.com', role: 'user', status: 'active' },
          tokens: { accessToken: 'acesso' },
        },
      },
    })

    await expect(
      useAuthStore.getState().login('ana@exemplo.com', 'senha'),
    ).rejects.toBeTruthy()

    // Sem o token de renovação a sessão morre no primeiro 401. Melhor recusar
    // agora do que deixar entrar e cair sozinho em quinze minutos.
    expect(useAuthStore.getState().isAuthenticated).toBe(false)
    expect(setTokens).not.toHaveBeenCalled()
  })

  it('sair do modo demonstração não chama a rota de logout', async () => {
    useAuthStore.getState().loginAsDemo()
    await useAuthStore.getState().logout()

    expect(api.post).not.toHaveBeenCalled()
    expect(clearTokens).toHaveBeenCalled()
    expect(useAuthStore.getState().isAuthenticated).toBe(false)
  })

  it('o logout limpa a sessão e não recusa quando a rota do servidor falha', async () => {
    // Era o defeito: o `finally` limpava o estado, mas sem `catch` a promessa
    // era recusada depois disso. Quem chamava `logout()` num onClick ficava
    // com uma recusa sem tratamento, e em modo estrito isso derruba a tela
    // num estado em que o usuário já está deslogado por baixo.
    vi.mocked(api.post).mockRejectedValueOnce(new Error('servidor fora'))
    useAuthStore.setState({ isAuthenticated: true, isDemo: false })

    await expect(useAuthStore.getState().logout()).resolves.toBeUndefined()

    expect(clearTokens).toHaveBeenCalled()
    expect(useAuthStore.getState().isAuthenticated).toBe(false)
  })
})

describe('notificationStore', () => {
  it('a notificação nova entra na frente e conta como não lida', () => {
    const store = useNotificationStore.getState()
    store.addNotification(naoLida('a'))
    store.addNotification(naoLida('b'))

    const s = useNotificationStore.getState()
    expect(s.notifications.map((n) => n.id)).toEqual(['b', 'a'])
    expect(s.unreadCount).toBe(2)
  })

  it('a lista para de crescer em 50 itens', () => {
    const store = useNotificationStore.getState()
    for (let i = 0; i < 60; i += 1) store.addNotification(naoLida(String(i)))

    expect(useNotificationStore.getState().notifications).toHaveLength(50)
    // o corte é pela cauda: o item mais antigo é o que sai
    expect(useNotificationStore.getState().notifications[0].id).toBe('59')
  })

  it('marcar como lida desconta uma vez e avisa o servidor', () => {
    const store = useNotificationStore.getState()
    store.addNotification(naoLida('a'))
    store.addNotification(naoLida('b'))

    useNotificationStore.getState().markAsRead('a')

    const s = useNotificationStore.getState()
    expect(s.unreadCount).toBe(1)
    expect(s.notifications.find((n) => n.id === 'a')?.isRead).toBe(true)
    expect(api.patch).toHaveBeenCalledWith('/notifications/a/read')
  })

  it('marcar duas vezes a mesma notificação não desconta duas vezes', () => {
    // Era o defeito: o desconto era incondicional, então dois cliques no mesmo
    // item mostravam menos pendência do que existia.
    const store = useNotificationStore.getState()
    store.addNotification(naoLida('a'))
    store.addNotification(naoLida('b'))

    useNotificationStore.getState().markAsRead('a')
    useNotificationStore.getState().markAsRead('a')

    expect(useNotificationStore.getState().unreadCount).toBe(1)
  })

  it('marcar um id que não está na lista não mexe no contador', () => {
    const store = useNotificationStore.getState()
    store.addNotification(naoLida('a'))

    useNotificationStore.getState().markAsRead('nao-existe')

    expect(useNotificationStore.getState().unreadCount).toBe(1)
  })

  it('o contador nunca fica negativo', () => {
    useNotificationStore.setState({
      notifications: [{ ...naoLida('a'), isRead: false }],
      unreadCount: 0,
      isLoading: false,
    })

    useNotificationStore.getState().markAsRead('a')

    expect(useNotificationStore.getState().unreadCount).toBe(0)
  })

  it('o modo demonstração traz notificações sem chamar a rede', async () => {
    await useNotificationStore.getState().fetchNotifications(true)

    const s = useNotificationStore.getState()
    expect(s.notifications.length).toBeGreaterThan(0)
    expect(s.unreadCount).toBe(s.notifications.filter((n) => !n.isRead).length)
    expect(api.get).not.toHaveBeenCalled()
  })

  it('a busca conta como não lidas só as que vieram não lidas', async () => {
    vi.mocked(api.get).mockResolvedValueOnce({
      data: {
        data: {
          notifications: [
            { ...naoLida('a'), isRead: false },
            { ...naoLida('b'), isRead: true },
            { ...naoLida('c'), isRead: false },
          ],
        },
      },
    })

    await useNotificationStore.getState().fetchNotifications()

    expect(useNotificationStore.getState().unreadCount).toBe(2)
    expect(useNotificationStore.getState().isLoading).toBe(false)
  })

  it('servidor fora não derruba a tela: notificação não é crítica', async () => {
    vi.mocked(api.get).mockRejectedValueOnce(new Error('servidor fora'))

    await expect(
      useNotificationStore.getState().fetchNotifications(),
    ).resolves.toBeUndefined()

    expect(useNotificationStore.getState().isLoading).toBe(false)
  })
})
