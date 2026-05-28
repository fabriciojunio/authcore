import axios, { AxiosInstance, AxiosError, InternalAxiosRequestConfig } from 'axios'

const BASE_URL = import.meta.env.VITE_API_URL ?? '/api/v1'

function createApiClient(): AxiosInstance {
  const client = axios.create({
    baseURL: BASE_URL,
    timeout: 15_000,
    headers: {
      'Content-Type': 'application/json',
      'X-Requested-With': 'XMLHttpRequest',
    },
  })

  client.interceptors.request.use(
    (config: InternalAxiosRequestConfig) => {
      const token = sessionStorage.getItem('access_token')
      if (token && config.headers) config.headers.Authorization = `Bearer ${token}`
      return config
    },
    (error: AxiosError) => Promise.reject(error),
  )

  client.interceptors.response.use(
    (response) => response,
    async (error: AxiosError) => {
      const original = error.config as InternalAxiosRequestConfig & { _retry?: boolean }
      if (error.response?.status === 401 && !original._retry) {
        original._retry = true
        try {
          const refreshToken = sessionStorage.getItem('refresh_token')
          if (refreshToken) {
            const res = await axios.post(`${BASE_URL}/auth/refresh`, { refreshToken })
            const { accessToken, refreshToken: newRefresh } = res.data.data.tokens
            sessionStorage.setItem('access_token', accessToken)
            sessionStorage.setItem('refresh_token', newRefresh)
            if (original.headers) original.headers.Authorization = `Bearer ${accessToken}`
            return client(original)
          }
        } catch {
          sessionStorage.removeItem('access_token')
          sessionStorage.removeItem('refresh_token')
          window.location.href = '/login'
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

export function setTokens(accessToken: string, refreshToken: string) {
  sessionStorage.setItem('access_token', accessToken)
  sessionStorage.setItem('refresh_token', refreshToken)
}

export function clearTokens() {
  sessionStorage.removeItem('access_token')
  sessionStorage.removeItem('refresh_token')
}
