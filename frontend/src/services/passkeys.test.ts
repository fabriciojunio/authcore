import { beforeEach, describe, expect, it, vi } from 'vitest'

// O navegador e a rede são dublados: o que está sob teste é a ordem das
// chamadas e o que vai em cada uma, não a criptografia, que o backend testa.
vi.mock('@simplewebauthn/browser', () => ({
  browserSupportsWebAuthn: vi.fn(() => true),
  startRegistration: vi.fn(() => Promise.resolve({ id: 'credencial' })),
  startAuthentication: vi.fn(() => Promise.resolve({ id: 'assercao' })),
}))
vi.mock('./api', () => ({
  api: { post: vi.fn(), get: vi.fn(), delete: vi.fn() },
}))

import { startAuthentication, startRegistration } from '@simplewebauthn/browser'
import { api } from './api'
import {
  cadastrarPasskey,
  entrarComPasskey,
  listarPasskeys,
  mensagemDeErroPasskey,
  removerPasskey,
} from './passkeys'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('passkeys', () => {
  it('cadastro pede as opções, chama o aparelho e envia a resposta com o nome', async () => {
    vi.mocked(api.post)
      .mockResolvedValueOnce({ data: { data: { challenge: 'desafio' } } })
      .mockResolvedValueOnce({ data: { data: { id: 'pk-1', name: 'Notebook' } } })

    const salva = await cadastrarPasskey('Notebook')

    expect(startRegistration).toHaveBeenCalledWith({ optionsJSON: { challenge: 'desafio' } })
    expect(api.post).toHaveBeenLastCalledWith('/auth/passkeys/registration/verify', {
      name: 'Notebook',
      response: { id: 'credencial' },
    })
    expect(salva).toEqual({ id: 'pk-1', name: 'Notebook' })
  })

  it('login devolve o fluxo recebido junto com a asserção do aparelho', async () => {
    vi.mocked(api.post)
      .mockResolvedValueOnce({ data: { data: { flowId: 'f-1', options: { challenge: 'desafio' } } } })
      .mockResolvedValueOnce({ data: { data: { accessToken: 'acesso' } } })

    await entrarComPasskey()

    expect(startAuthentication).toHaveBeenCalledWith({ optionsJSON: { challenge: 'desafio' } })
    expect(api.post).toHaveBeenLastCalledWith('/auth/passkeys/authentication/verify', {
      flowId: 'f-1',
      response: { id: 'assercao' },
    })
  })

  it('cancelar no aparelho não chega ao servidor', async () => {
    vi.mocked(api.post).mockResolvedValueOnce({ data: { data: { flowId: 'f-1', options: {} } } })
    vi.mocked(startAuthentication).mockRejectedValueOnce(Object.assign(new Error('x'), { name: 'NotAllowedError' }))

    await expect(entrarComPasskey()).rejects.toMatchObject({ name: 'NotAllowedError' })
    expect(api.post).toHaveBeenCalledTimes(1)
  })

  it('lista e remove pelo id, sem deixar o id mudar o caminho', async () => {
    vi.mocked(api.get).mockResolvedValueOnce({ data: { data: [{ id: 'pk-1' }] } })
    vi.mocked(api.delete).mockResolvedValueOnce({})

    expect(await listarPasskeys()).toEqual([{ id: 'pk-1' }])
    await removerPasskey('../users/u-1')

    expect(api.delete).toHaveBeenCalledWith('/auth/passkeys/..%2Fusers%2Fu-1')
  })

  it('traduz o cancelamento e o aparelho repetido, e mantém a mensagem do servidor', () => {
    expect(mensagemDeErroPasskey({ name: 'NotAllowedError' }, 'padrão')).toBe('Operação cancelada no aparelho')
    expect(mensagemDeErroPasskey({ name: 'InvalidStateError' }, 'padrão')).toBe('Este aparelho já tem uma passkey cadastrada')
    expect(mensagemDeErroPasskey({ message: 'Invalid passkey' }, 'padrão')).toBe('Invalid passkey')
    expect(mensagemDeErroPasskey(undefined, 'padrão')).toBe('padrão')
  })
})
