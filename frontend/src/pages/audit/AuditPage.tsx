import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, ArrowRight, Download, Search } from 'lucide-react'
import { useAuthStore } from '../../store/authStore'
import { api } from '../../services/api'
import {
  AUDIT_ACTIONS, describeDetails, formatTime, toCsv,
  type AuditEntry, type AuditMeta,
} from '../../utils/audit'
import styles from './AuditPage.module.css'

const POR_PAGINA = 20

// Só no modo demonstração, que não tem back-end. Endereços de documentação (RFC 5737).
const DEMO: AuditEntry[] = [
  { id: 'd1', action: 'auth.login_failed', userId: 'u2', actor: 'bob@corp.io', ipAddress: '203.0.113.42', details: { reason: 'bad_password' }, createdAt: '2026-05-28T12:14:00Z' },
  { id: 'd2', action: 'auth.login', userId: 'u2', actor: 'bob@corp.io', ipAddress: '203.0.113.42', details: { method: 'password' }, createdAt: '2026-05-28T12:15:00Z' },
  { id: 'd3', action: 'passkey.register', userId: 'u2', actor: 'bob@corp.io', ipAddress: '203.0.113.42', details: null, createdAt: '2026-05-28T12:20:00Z' },
  { id: 'd4', action: 'auth.login_failed', userId: null, actor: null, ipAddress: '198.51.100.7', details: { reason: 'unknown_user' }, createdAt: '2026-05-27T23:02:00Z' },
  { id: 'd5', action: 'auth.refresh_reuse', userId: 'u4', actor: 'diana@startup.dev', ipAddress: '192.0.2.55', details: null, createdAt: '2026-05-27T19:40:00Z' },
  { id: 'd6', action: 'user.password_change', userId: 'u4', actor: 'diana@startup.dev', ipAddress: '192.0.2.10', details: null, createdAt: '2026-05-27T19:45:00Z' },
]

const actionColor: Record<string, { bg: string; color: string }> = {
  'auth.login':            { bg: 'rgba(59,130,246,0.1)',  color: '#3b82f6' },
  'auth.login_failed':     { bg: 'rgba(239,68,68,0.1)',   color: '#ef4444' },
  'auth.refresh_reuse':    { bg: 'rgba(239,68,68,0.1)',   color: '#ef4444' },
  'auth.register_existing':{ bg: 'rgba(245,158,11,0.1)',  color: '#f59e0b' },
  'user.password_change':  { bg: 'rgba(245,158,11,0.1)',  color: '#f59e0b' },
  'user.delete':           { bg: 'rgba(239,68,68,0.1)',   color: '#ef4444' },
  'passkey.register':      { bg: 'rgba(34,197,94,0.1)',   color: '#22c55e' },
  'passkey.remove':        { bg: 'rgba(100,96,240,0.12)', color: '#8b87ff' },
}

function baixarCsv(entries: AuditEntry[]): void {
  const blob = new Blob([toCsv(entries)], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = 'auditoria.csv'
  link.click()
  URL.revokeObjectURL(url)
}

export default function AuditPage() {
  const isDemo = useAuthStore((s) => s.isDemo)
  const [page, setPage] = useState(1)
  const [action, setAction] = useState('')
  const [busca, setBusca] = useState('')

  const { data, isLoading, isError } = useQuery({
    queryKey: ['audit', page, action],
    queryFn: async () => {
      const res = await api.get('/audit', {
        params: { page, limit: POR_PAGINA, ...(action && { action }) },
      })
      return { entries: res.data.data as AuditEntry[], meta: res.data.meta as AuditMeta }
    },
    enabled: !isDemo,
  })

  const entries = useMemo(
    () => (isDemo ? DEMO.filter((e) => !action || e.action === action) : (data?.entries ?? [])),
    [isDemo, action, data],
  )
  const meta: AuditMeta | undefined = isDemo
    ? { total: entries.length, page: 1, limit: POR_PAGINA, totalPages: 1, hasNext: false, hasPrev: false }
    : data?.meta

  // A busca filtra a página carregada; o filtro de ação vai para o servidor.
  const visiveis = useMemo(() => {
    const termo = busca.trim().toLowerCase()
    if (!termo) return entries
    return entries.filter((e) => (e.actor ?? '').toLowerCase().includes(termo)
      || (e.ipAddress ?? '').includes(termo))
  }, [entries, busca])

  return (
    <div className={styles.page}>
      <div className={styles.pageBar}>
        <span className={styles.pageTitle}>Auditoria</span>
        {meta && <span className={styles.pageBadge}>{meta.total.toLocaleString('pt-BR')} eventos</span>}
        <div className={styles.pageBarRight}>
          <select
            className={styles.select}
            aria-label="Filtrar por ação"
            value={action}
            onChange={(e) => { setAction(e.target.value); setPage(1) }}
          >
            <option value="">Todas as ações</option>
            {Object.entries(AUDIT_ACTIONS).map(([valor, rotulo]) => (
              <option key={valor} value={valor}>{rotulo}</option>
            ))}
          </select>
          <div className={styles.searchBox}>
            <Search size={16} aria-hidden="true" />
            <input
              className={styles.searchInp}
              placeholder="Filtrar por e-mail ou IP…"
              aria-label="Buscar na auditoria"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
            />
          </div>
          <button className={styles.btnOutline} onClick={() => baixarCsv(visiveis)} disabled={!visiveis.length}>
            <Download size={14} aria-hidden="true" />
            Exportar
          </button>
        </div>
      </div>

      {isDemo && (
        <div className={styles.demoNote} role="note">
          Dados de demonstração. Com uma sessão real, esta tela lê a trilha gravada pela API.
        </div>
      )}

      <div className={styles.tableWrap}>
        <div className={styles.tableHead}>
          <div className={styles.th}>Ator</div>
          <div className={styles.th}>Ação</div>
          <div className={styles.th}>Detalhe</div>
          <div className={styles.th}>IP</div>
          <div className={styles.th}>Hora</div>
        </div>

        {isLoading && !isDemo && (
          <div className={styles.stateBox}>
            <div className={styles.spinner} aria-hidden="true" />
            Carregando a trilha…
          </div>
        )}

        {isError && !isDemo && (
          <div className={styles.stateBox} role="alert">
            Não foi possível carregar a trilha. Só administradores podem vê-la.
          </div>
        )}

        {!isLoading && !isError && !visiveis.length && (
          <div className={styles.stateBox}>Nenhum evento encontrado.</div>
        )}

        {visiveis.map((row) => {
          const clr = actionColor[row.action] ?? { bg: 'var(--s2)', color: 'var(--muted)' }
          return (
            <div key={row.id} className={styles.tRow}>
              <div className={styles.actorCell}>{row.actor ?? 'sem conta'}</div>
              <div>
                <span className={styles.actionChip} style={{ background: clr.bg, color: clr.color }}>
                  {AUDIT_ACTIONS[row.action] ?? row.action}
                </span>
              </div>
              <div className={styles.targetCell}>{describeDetails(row.details)}</div>
              <div className={styles.ipCell}>{row.ipAddress ?? '-'}</div>
              <div className={styles.timeCell}>{formatTime(row.createdAt)}</div>
            </div>
          )
        })}
      </div>

      {meta && (
        <div className={styles.tableFoot}>
          <span className={styles.footTxt}>
            Página {meta.page} de {Math.max(meta.totalPages, 1)}
          </span>
          <div className={styles.pag}>
            <button className={styles.pagBtn} aria-label="Página anterior" disabled={!meta.hasPrev}
              onClick={() => setPage((p) => Math.max(1, p - 1))}>
              <ArrowLeft size={12} aria-hidden="true" />
            </button>
            <button className={styles.pagBtn} aria-label="Próxima página" disabled={!meta.hasNext}
              onClick={() => setPage((p) => p + 1)}>
              <ArrowRight size={12} aria-hidden="true" />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
