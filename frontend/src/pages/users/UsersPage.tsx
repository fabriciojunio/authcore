import { useQuery } from '@tanstack/react-query'
import { useAuthStore } from '../../store/authStore'
import { api } from '../../services/api'
import styles from '../UsersPage.module.css'

interface User {
  id: string; name: string; email: string
  role: string; status: string
  createdAt: string; lastLoginAt: string | null
}

const DEMO_USERS: User[] = [
  { id: 'u1', name: 'Alice Santos',    email: 'alice@acme.com',     role: 'admin',   status: 'active',    createdAt: '2024-01-15T10:00:00Z', lastLoginAt: '2024-12-20T08:30:00Z' },
  { id: 'u2', name: 'Bob Oliveira',    email: 'bob@corp.io',         role: 'manager', status: 'active',    createdAt: '2024-02-20T14:00:00Z', lastLoginAt: '2024-12-19T16:45:00Z' },
  { id: 'u3', name: 'Charlie Lima',    email: 'charlie@example.com', role: 'user',    status: 'suspended', createdAt: '2024-03-10T09:00:00Z', lastLoginAt: null },
  { id: 'u4', name: 'Diana Costa',     email: 'diana@startup.dev',   role: 'admin',   status: 'active',    createdAt: '2024-04-05T11:00:00Z', lastLoginAt: '2024-12-20T09:00:00Z' },
  { id: 'u5', name: 'Eva Martins',     email: 'eva@company.com',     role: 'user',    status: 'pending',   createdAt: '2024-05-01T08:00:00Z', lastLoginAt: null },
]

const avatarColors: Record<string, { bg: string; color: string }> = {
  admin:   { bg: 'rgba(100,96,240,0.15)', color: '#8b87ff' },
  manager: { bg: 'rgba(59,130,246,0.12)', color: '#3b82f6' },
  user:    { bg: 'rgba(255,255,255,0.06)', color: '#5a5a70' },
}

function initials(name: string) {
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
}

function fmtDate(d: string | null) {
  if (!d) return '-'
  return new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })
}

export default function UsersPage() {
  const isDemo = useAuthStore((s) => s.isDemo)

  const { data: apiData, isLoading, isError } = useQuery({
    queryKey: ['users'],
    queryFn: async () => {
      const res = await api.get('/users?limit=20')
      return res.data.data as { data: User[]; total: number; nextCursor: string | null }
    },
    enabled: !isDemo,
  })

  const displayData = isDemo
    ? { data: DEMO_USERS, total: DEMO_USERS.length, nextCursor: null }
    : apiData

  return (
    <div className={styles.page}>
      <div className={styles.pageBar}>
        <span className={styles.pageTitle}>Usuários</span>
        {displayData && <span className={styles.pageBadge}>{displayData.total.toLocaleString('pt-BR')}</span>}
        <div className={styles.pageBarRight}>
          <div className={styles.searchBox}>
            <i className="ti ti-search" aria-hidden="true" />
            <input className={styles.searchInp} placeholder="Buscar nome ou e-mail…" aria-label="Buscar usuários" />
          </div>
          <button className={styles.btnOutline} aria-label="Filtros">
            <i className="ti ti-adjustments-horizontal" aria-hidden="true" style={{ fontSize: 14 }} />
            Filtros
          </button>
          <button className={styles.btnPrimary} aria-label="Convidar usuário">
            <i className="ti ti-plus" aria-hidden="true" style={{ fontSize: 14 }} />
            Convidar
          </button>
        </div>
      </div>

      <div className={styles.tableWrap}>
        <div className={styles.tableHead}>
          <div className={styles.th}>Usuário</div>
          <div className={styles.th}>Acesso</div>
          <div className={styles.th}>Status</div>
          <div className={styles.th}>Último login</div>
          <div className={styles.th} />
        </div>

        {isLoading && !isDemo && (
          <div className={styles.stateBox}>
            <div className={styles.spinner} aria-hidden="true" />
            Carregando usuários…
          </div>
        )}

        {isError && !isDemo && (
          <div className={styles.stateBox}>
            Falha ao carregar usuários
          </div>
        )}

        {displayData?.data.map(user => {
          const clr = avatarColors[user.role] ?? avatarColors.user
          const isSuspended = user.status === 'suspended'

          return (
            <div key={user.id} className={styles.tRow} style={isSuspended ? { opacity: 0.45 } : {}}>
              <div className={styles.userCell}>
                <div className={styles.ava} style={{ background: clr.bg, color: clr.color }}>
                  {initials(user.name)}
                </div>
                <div style={{ minWidth: 0 }}>
                  <div className={styles.uName} style={isSuspended ? { textDecoration: 'line-through' } : {}}>
                    {user.name}
                  </div>
                  <div className={styles.uEmail}>{user.email}</div>
                </div>
              </div>

              <div>
                <span className={`${styles.chip} ${
                  user.role === 'admin'   ? styles.cAdmin   :
                  user.role === 'manager' ? styles.cManager : styles.cUser
                }`}>
                  {user.role}
                </span>
              </div>

              <div className={`${styles.statusCell} ${
                user.status === 'active'    ? styles.sActive    :
                user.status === 'pending'   ? styles.sPending   : styles.sSuspended
              }`}>
                <div className={styles.sDot} />
                <span className={styles.sTxt}>{user.status}</span>
              </div>

              <div className={styles.dateCell}>{fmtDate(user.lastLoginAt)}</div>

              <div className={styles.rowActions}>
                <button className={styles.rowBtn} aria-label={`Editar ${user.name}`}>
                  <i className="ti ti-edit" aria-hidden="true" />
                </button>
                <button className={styles.rowBtn} aria-label="Mais opções">
                  <i className="ti ti-dots" aria-hidden="true" />
                </button>
              </div>
            </div>
          )
        })}
      </div>

      {displayData && (
        <div className={styles.tableFoot}>
          <span className={styles.footTxt}>
            Mostrando 1–{displayData.data.length} de {displayData.total.toLocaleString('pt-BR')}
          </span>
          {displayData.nextCursor && (
            <span className={styles.cursorTag}>cursor: {displayData.nextCursor.slice(0, 12)}…</span>
          )}
          <div className={styles.pag}>
            <button className={`${styles.pagBtn} ${styles.pagActive}`}>1</button>
            <button className={styles.pagBtn}>2</button>
            <button className={styles.pagBtn}>3</button>
            <button className={styles.pagBtn} aria-label="Próxima página">
              <i className="ti ti-arrow-right" aria-hidden="true" style={{ fontSize: 12 }} />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
