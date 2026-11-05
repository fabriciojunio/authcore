import { describe, expect, it } from 'vitest'
import { AUDIT_ACTIONS, describeDetails, toCsv, type AuditEntry } from './audit'

const linha = (over: Partial<AuditEntry> = {}): AuditEntry => ({
  id: 'a-1',
  action: 'auth.login_failed',
  userId: 'u-1',
  actor: 'pessoa@example.test',
  ipAddress: '203.0.113.7',
  details: { reason: 'bad_password' },
  createdAt: '2026-11-02T12:00:00.000Z',
  ...over,
})

describe('trilha de auditoria no painel', () => {
  it('descreve o motivo do login recusado e o método do login', () => {
    expect(describeDetails({ reason: 'bad_password' })).toBe('senha errada')
    expect(describeDetails({ reason: 'bad_totp' })).toBe('código de dois fatores errado')
    expect(describeDetails({ method: 'passkey' })).toBe('com passkey')
    expect(describeDetails({ method: 'password' })).toBe('com senha')
    expect(describeDetails(null)).toBe('-')
  })

  it('motivo desconhecido aparece cru, sem quebrar a tela', () => {
    expect(describeDetails({ reason: 'novo_motivo' })).toBe('novo_motivo')
  })

  it('o CSV traz cabeçalho e uma linha por evento, entre aspas', () => {
    const csv = toCsv([linha()]).split('\r\n')
    expect(csv[0]).toBe('"data","acao","ator","ip","detalhe"')
    expect(csv[1]).toBe('"2026-11-02T12:00:00.000Z","auth.login_failed","pessoa@example.test","203.0.113.7","senha errada"')
  })

  it.each(['=HYPERLINK("http://x")', '+1', '-1', '@SUM(A1)', '\tx', '\rx'])(
    'neutraliza fórmula vinda do e-mail cadastrado: %s', (valor) => {
      const csv = toCsv([linha({ actor: valor })])
      expect(csv.split('\r\n')[1]).toContain(`"'${valor.replace(/"/g, '""')}"`)
    },
  )

  it('aspas dentro do valor são dobradas', () => {
    expect(toCsv([linha({ actor: 'a"b@x.test' })])).toContain('"a""b@x.test"')
  })

  it('o filtro oferece as mesmas ações que o back-end grava', () => {
    expect(Object.keys(AUDIT_ACTIONS).sort()).toEqual([
      'auth.login', 'auth.login_failed', 'auth.logout', 'auth.refresh_reuse', 'auth.register',
      'auth.register_existing', 'passkey.register', 'passkey.remove', 'user.delete', 'user.password_change',
    ])
  })
})
