export interface AuditEntry {
  id: string
  action: string
  userId: string | null
  actor: string | null
  ipAddress: string | null
  details: Record<string, string> | null
  createdAt: string
}

export interface AuditMeta {
  total: number
  page: number
  limit: number
  totalPages: number
  hasNext: boolean
  hasPrev: boolean
}

// As mesmas ações que o back-end grava (AuditAction); o filtro só oferece estas.
export const AUDIT_ACTIONS: Record<string, string> = {
  'auth.login': 'Login',
  'auth.login_failed': 'Login recusado',
  'auth.logout': 'Logout',
  'auth.register': 'Cadastro',
  'auth.register_existing': 'Cadastro com e-mail já usado',
  'auth.refresh_reuse': 'Reuso de token de renovação',
  'user.password_change': 'Troca de senha',
  'user.delete': 'Conta excluída',
  'passkey.register': 'Passkey cadastrada',
  'passkey.remove': 'Passkey removida',
}

const REASONS: Record<string, string> = {
  unknown_user: 'e-mail não cadastrado',
  bad_password: 'senha errada',
  bad_totp: 'código de dois fatores errado',
  locked: 'conta bloqueada',
  unverified: 'e-mail não verificado',
  inactive: 'conta inativa',
}

export function describeDetails(details: AuditEntry['details']): string {
  if (!details) return '-'
  if (details['reason']) return REASONS[details['reason']] ?? details['reason']
  if (details['method']) return details['method'] === 'passkey' ? 'com passkey' : 'com senha'
  return '-'
}

// Planilha executa célula que começa com = + - @, tabulação ou retorno de carro.
// O ator vem do e-mail que a própria pessoa cadastrou, então é texto do atacante.
function cell(value: string): string {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value
  return `"${safe.replace(/"/g, '""')}"`
}

export function toCsv(entries: AuditEntry[]): string {
  const header = ['data', 'acao', 'ator', 'ip', 'detalhe']
  const rows = entries.map((e) => [
    e.createdAt,
    e.action,
    e.actor ?? '',
    e.ipAddress ?? '',
    describeDetails(e.details),
  ])
  return [header, ...rows].map((r) => r.map(cell).join(',')).join('\r\n')
}

export function formatTime(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  })
}
