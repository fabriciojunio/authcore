import axios, { AxiosError, type InternalAxiosRequestConfig } from 'axios'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { api, clearTokens, setTokens } from './api'

const originalAdapter = api.defaults.adapter

function unauthorized(config: InternalAxiosRequestConfig) {
  return new AxiosError('Sessão expirada', 'ERR_BAD_REQUEST', config, undefined, {
    status: 401, statusText: 'Unauthorized', headers: {}, config,
    data: { error: { code: 'UNAUTHORIZED', message: 'Sessão expirada' } },
  })
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => { resolve = done })
  return { promise, resolve }
}

beforeEach(() => {
  clearTokens()
  setTokens('acesso-antigo')
  api.defaults.adapter = async (config) => {
    if (config.headers.Authorization !== 'Bearer acesso-novo') throw unauthorized(config)
    return { data: { ok: true }, status: 200, statusText: 'OK', headers: {}, config }
  }
})

afterEach(() => {
  api.defaults.adapter = originalAdapter
  vi.restoreAllMocks()
  clearTokens()
})

describe('renovação de sessão', () => {
  it('compartilha uma renovação entre requisições concorrentes', async () => {
    const response = deferred<{ data: { data: { accessToken: string } } }>()
    const refresh = vi.spyOn(axios, 'post').mockReturnValue(response.promise)
    const requests = Promise.all([api.get('/users/me'), api.get('/notifications')])
    await vi.waitFor(() => expect(refresh).toHaveBeenCalledTimes(1))
    response.resolve({ data: { data: { accessToken: 'acesso-novo' } } })
    expect((await requests).map((result) => result.status)).toEqual([200, 200])
    expect(refresh).toHaveBeenCalledTimes(1)
    expect(sessionStorage.getItem('refresh_token')).toBeNull()
    expect(refresh).toHaveBeenCalledWith('/api/v1/auth/refresh', {}, { timeout: 15_000, withCredentials: true })
  })

  it('reutiliza o acesso renovado quando outro 401 chega atrasado', async () => {
    const delay = deferred<void>()
    const refresh = vi.spyOn(axios, 'post').mockResolvedValue({ data: { data: {
      accessToken: 'acesso-novo',
    } } })
    api.defaults.adapter = async (config) => {
      if (config.headers.Authorization === 'Bearer acesso-novo') {
        return { data: {}, status: 200, statusText: 'OK', headers: {}, config }
      }
      if (config.url === '/notifications') await delay.promise
      throw unauthorized(config)
    }
    const late = api.get('/notifications')
    expect((await api.get('/users/me')).status).toBe(200)
    delay.resolve()
    expect((await late).status).toBe(200)
    expect(refresh).toHaveBeenCalledTimes(1)
  })

  it('não restaura credenciais após logout durante a renovação', async () => {
    const response = deferred<{ data: { data: { accessToken: string } } }>()
    const refresh = vi.spyOn(axios, 'post').mockReturnValue(response.promise)
    const request = api.get('/users/me')
    const rejected = expect(request).rejects.toMatchObject({ status: 401 })
    await vi.waitFor(() => expect(refresh).toHaveBeenCalledTimes(1))
    clearTokens()
    response.resolve({ data: { data: { accessToken: 'acesso-novo' } } })
    await rejected
    expect(sessionStorage.getItem('access_token')).toBeNull()
    expect(sessionStorage.getItem('refresh_token')).toBeNull()
  })

  it('não renova uma sessão para ocultar falha de login', async () => {
    const refresh = vi.spyOn(axios, 'post')
    await expect(api.post('/auth/login', { email: 'pessoa@example.test', password: 'incorreta' }))
      .rejects.toMatchObject({ status: 401 })
    expect(refresh).not.toHaveBeenCalled()
    expect(sessionStorage.getItem('access_token')).toBe('acesso-antigo')
  })
})
