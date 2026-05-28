import { useAuthStore } from '../../store/authStore'
import styles from '../DashboardPage.module.css'

const metrics = [
  { label: 'Usuários totais',  value: '2.491', delta: '↑ 12%', info: 'este mês' },
  { label: 'Sessões ativas',   value: '847',   delta: '↑ 5%',  info: 'vs ontem' },
  { label: 'Requisições',      value: '128k',  delta: '↑ 34%', info: 'últimas 24h' },
  { label: 'Taxa de erro',     value: '0.02%', delta: '↓ 8%',  info: 'melhorando' },
]

const activity = [
  { initials: 'AL', color: 'rgba(34,197,94,0.1)',   txtColor: '#22c55e', action: 'Conta registrada',  email: 'alice@acme.com',     time: '2m',  tag: 'novo',  tagColor: 'rgba(34,197,94,0.1)',  tagTxt: '#22c55e' },
  { initials: 'BO', color: 'rgba(100,96,240,0.1)',  txtColor: '#8b87ff', action: 'Senha atualizada',  email: 'bob@corp.io',         time: '14m', tag: null },
  { initials: 'CH', color: 'rgba(239,68,68,0.1)',   txtColor: '#ef4444', action: 'Usuário removido',  email: 'charlie@example.com', time: '1h',  tag: 'soft',  tagColor: 'rgba(239,68,68,0.1)',  tagTxt: '#ef4444' },
  { initials: 'DI', color: 'rgba(100,96,240,0.1)',  txtColor: '#8b87ff', action: 'Promovido a Admin', email: 'diana@startup.dev',   time: '3h',  tag: null },
  { initials: 'EV', color: 'rgba(245,158,11,0.1)',  txtColor: '#f59e0b', action: 'Conta suspensa',    email: 'eve@company.com',     time: '5h',  tag: null },
]

const systemInfo = [
  { k: 'Status',     v: 'Operacional' },
  { k: 'Uptime',    v: '14d 6h sem restart' },
  { k: 'Memória',   v: '128 MB heap' },
  { k: 'Node.js',   v: 'v20.14 LTS' },
  { k: 'Versão',    v: '1.0.0 · production' },
  { k: 'Banco',     v: 'PostgreSQL · healthy' },
  { k: 'Cache',     v: 'Redis · healthy' },
  { k: 'Websocket', v: '847 conexões ativas' },
]

export default function DashboardPage() {
  const user = useAuthStore(s => s.user)
  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Bom dia' : hour < 18 ? 'Boa tarde' : 'Boa noite'

  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <div className={styles.greeting}>{greeting}</div>
        <h1 className={styles.pageTitle}>{user?.name}</h1>
      </div>

      <div className={styles.metrics}>
        {metrics.map(m => (
          <div key={m.label} className={styles.metric}>
            <div className={styles.mLabel}>{m.label}</div>
            <div className={styles.mValue}>{m.value}</div>
            <div className={styles.mDelta}><span>{m.delta}</span> {m.info}</div>
          </div>
        ))}
      </div>

      <div className={styles.gridTwo}>
        <div>
          <div className={styles.sectionLabel}>Atividade recente</div>
          <div className={styles.actList}>
            {activity.map((a, i) => (
              <div key={i} className={styles.actRow}>
                <div className={styles.actAva} style={{ background: a.color, color: a.txtColor }}>
                  {a.initials}
                </div>
                <div className={styles.actBody}>
                  <div className={styles.actAction}>
                    {a.action}
                    {a.tag && (
                      <span className={styles.tag} style={{ background: a.tagColor, color: a.tagTxt }}>
                        {a.tag}
                      </span>
                    )}
                  </div>
                  <div className={styles.actEmail}>{a.email}</div>
                </div>
                <div className={styles.actTime}>{a.time}</div>
              </div>
            ))}
          </div>
        </div>

        <div>
          <div className={styles.sectionLabel}>Status do sistema</div>
          <div className={styles.sideCard}>
            {systemInfo.map(r => (
              <div key={r.k} className={styles.sideCardRow}>
                <span className={styles.sk}>{r.k}</span>
                <span className={styles.sv}>{r.v}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
