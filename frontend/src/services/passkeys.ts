import {
  browserSupportsWebAuthn,
  startAuthentication,
  startRegistration,
  type PublicKeyCredentialCreationOptionsJSON,
  type PublicKeyCredentialRequestOptionsJSON,
} from '@simplewebauthn/browser'
import { api } from './api'

export interface PasskeyResumo {
  id: string
  name: string
  createdAt: string
  lastUsedAt: string | null
}

export const suportaPasskey = browserSupportsWebAuthn

export async function cadastrarPasskey(name: string): Promise<PasskeyResumo> {
  const options = await api.post('/auth/passkeys/registration/options', {})
  const optionsJSON = options.data.data as PublicKeyCredentialCreationOptionsJSON
  // Aqui o navegador pede a digital, o rosto ou o PIN do aparelho.
  const response = await startRegistration({ optionsJSON })
  const salva = await api.post('/auth/passkeys/registration/verify', { name, response })
  return salva.data.data as PasskeyResumo
}

export async function entrarComPasskey(): Promise<unknown> {
  const inicio = await api.post('/auth/passkeys/authentication/options', {})
  const { flowId, options } = inicio.data.data as { flowId: string; options: PublicKeyCredentialRequestOptionsJSON }
  const response = await startAuthentication({ optionsJSON: options })
  return api.post('/auth/passkeys/authentication/verify', { flowId, response })
}

export async function listarPasskeys(): Promise<PasskeyResumo[]> {
  const resposta = await api.get('/auth/passkeys')
  return resposta.data.data as PasskeyResumo[]
}

export async function removerPasskey(id: string): Promise<void> {
  await api.delete(`/auth/passkeys/${encodeURIComponent(id)}`)
}

// O navegador recusa com NotAllowedError quando a pessoa cancela ou o tempo
// acaba. Isso não é erro do sistema e não merece mensagem técnica.
export function mensagemDeErroPasskey(err: unknown, padrao: string): string {
  const e = err as { name?: string; message?: string }
  if (e?.name === 'NotAllowedError') return 'Operação cancelada no aparelho'
  if (e?.name === 'InvalidStateError') return 'Este aparelho já tem uma passkey cadastrada'
  return e?.message ?? padrao
}
