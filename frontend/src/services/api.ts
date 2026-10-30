import axios, { AxiosInstance, AxiosError, InternalAxiosRequestConfig } from 'axios'

const BASE_URL = import.meta.env.VITE_API_URL ?? '/api/v1'
let sessionEpoch = 0
let refreshPending: { epoch: number; promise: Promise<string> } | null = null
type SessionRequest = InternalAxiosRequestConfig & { _retry?: boolean; _sessionEpoch?: number }

function refreshSession(epoch: number): Promise<string> {
  if (refreshPending?.epoch === epoch) return refreshPending.promise
  const promise = axios.post(`${BASE_URL}/auth/refresh`, {}, { timeout: 15_000, withCredentials: true })
    .then((response) => {
      const accessToken = response.data?.data?.accessToken
      if (typeof accessToken !== 'string' || !accessToken) {
        throw new Error('Resposta de renovação inválida')
      }
      if (sessionEpoch !== epoch) {
        throw new Error('A sessão mudou durante a renovação')
      }
      sessionStorage.setItem('access_token', accessToken)
      return accessToken as string
    }).finally(() => {
      if (refreshPending?.promise === promise) refreshPending = null
    })
  refreshPending = { epoch, promise }
  return promise
}

function createApiClient(): AxiosInstance {
  const client = axios.create({
    baseURL: BASE_URL,
    timeout: 15_000,
    withCredentials: true,
    headers: {
      'Content-Type': 'application/json',
      'X-Requested-With': 'XMLHttpRequest',
    },
  })

  client.interceptors.request.use(
    (config: InternalAxiosRequestConfig) => {
      const request = config as SessionRequest
      if (request._sessionEpoch !== undefined && request._sessionEpoch !== sessionEpoch) {
        throw new axios.CanceledError('A sessão mudou antes do envio')
      }
      request._sessionEpoch ??= sessionEpoch
      const token = sessionStorage.getItem('access_token')
      if (token && config.headers) config.headers.Authorization = `Bearer ${token}`
      return config
    },
    (error: AxiosError) => Promise.reject(error),
  )

  client.interceptors.response.use(
    (response) => response,
    async (error: AxiosError) => {
      const original = error.config as SessionRequest | undefined
      const credentialRoute = /\/auth\/(login|register|refresh|passkeys\/authentication)(?:[/?]|$)/.test(original?.url ?? '')
      if (error.response?.status === 401 && original && !original._retry && !credentialRoute
          && original._sessionEpoch === sessionEpoch) {
        original._retry = true
        const epoch = sessionEpoch
        try {
          const currentAccess = sessionStorage.getItem('access_token')
          // Outra resposta pode ter concluído a renovação antes deste 401.
          if (currentAccess && original.headers.Authorization !== `Bearer ${currentAccess}`) {
            return client(original)
          }
          if (currentAccess) {
            const accessToken = await refreshSession(epoch)
            if (original.headers) original.headers.Authorization = `Bearer ${accessToken}`
            return client(original)
          }
        } catch {
          if (sessionEpoch === epoch) {
            clearTokens()
            window.location.href = '/login'
          }
        }
      }
      const serverError = (error.response?.data as { error?: { code: string; message: string } })?.error
      return Promise.reject({
        code: serverError?.code ?? 'NETWORK_ERROR',
        message: serverError?.message ?? 'Erro de conexão',
        status: error.response?.status ?? 0,
      })
    },
  )

  return client
}

export const api = createApiClient()

export function setTokens(accessToken: string) {
  sessionEpoch += 1
  sessionStorage.setItem('access_token', accessToken)
  sessionStorage.removeItem('refresh_token')
}

export function clearTokens() {
  sessionEpoch += 1
  sessionStorage.removeItem('access_token')
  sessionStorage.removeItem('refresh_token')
}
