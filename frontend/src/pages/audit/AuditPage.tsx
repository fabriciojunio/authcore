import styles from './AuditPage.module.css'

const auditLog = [
  { id: 'a1', actor: 'alice@acme.com',     action: 'user.create',         target: 'bob@corp.io',           ip: '192.168.1.10', time: '28/05 09:14' },
  { id: 'a2', actor: 'System Admin',       action: 'user.role_change',    target: 'diana@startup.dev',     ip: '10.0.0.1',     time: '28/05 08:52' },
  { id: 'a3', actor: 'alice@acme.com',     action: 'user.suspend',        target: 'charlie@example.com',   ip: '192.168.1.10', time: '27/05 17:30' },
  { id: 'a4', actor: 'bob@corp.io',        action: 'auth.login',          target: '-',                     ip: '203.0.113.42', time: '27/05 16:05' },
  { id: 'a5', actor: 'System Admin',       action: 'settings.update',     target: 'rate_limit',            ip: '10.0.0.1',     time: '27/05 14:20' },
  { id: 'a6', actor: 'diana@startup.dev',  action: 'auth.password_reset', target: '-',                     ip: '198.51.100.7', time: '27/05 11:48' },
  { id: 'a7', actor: 'System Admin',       action: 'user.delete',         target: 'old-user@example.com',  ip: '10.0.0.1',     time: '26/05 18:00' },
  { id: 'a8', actor: 'eva@company.com',    action: 'auth.login_failed',   target: '-',                     ip: '172.16.0.55',  time: '26/05 15:33' },
]

const actionColor: Record<string, { bg: string; color: string }> = {
  'user.create':        { bg: 'rgba(34,197,94,0.1)',   color: '#22c55e' },
  'user.role_change':   { bg: 'rgba(100,96,240,0.12)', color: '#8b87ff' },
  'user.suspend':       { bg: 'rgba(245,158,11,0.1)',  color: '#f59e0b' },
  'user.delete':        { bg: 'rgba(239,68,68,0.1)',   color: '#ef4444' },
  'auth.login':         { bg: 'rgba(59,130,246,0.1)',  color: '#3b82f6' },
  'auth.login_failed':  { bg: 'rgba(239,68,68,0.1)',   color: '#ef4444' },
  'auth.password_reset':{ bg: 'rgba(245,158,11,0.1)',  color: '#f59e0b' },
  'settings.update':    { bg: 'rgba(100,96,240,0.12)', color: '#8b87ff' },
}

export default function AuditPage() {
  return (
    <div className={styles.page}>
      <div className={styles.pageBar}>
        <span className={styles.pageTitle}>Auditoria</span>
        <span className={styles.pageBadge}>{auditLog.length} eventos</span>
        <div className={styles.pageBarRight}>
          <div className={styles.searchBox}>
            <i className="ti ti-search" aria-hidden="true" />
            <input className={styles.searchInp} placeholder="Filtrar por ator ou ação…" aria-label="Buscar auditoria" />
          </div>
          <button className={styles.btnOutline}>
            <i className="ti ti-download" aria-hidden="true" style={{ fontSize: 14 }} />
            Exportar
          </button>
        </div>
      </div>

      <div className={styles.tableWrap}>
        <div className={styles.tableHead}>
          <div className={styles.th}>Ator</div>
          <div className={styles.th}>Ação</div>
          <div className={styles.th}>Alvo</div>
          <div className={styles.th}>IP</div>
          <div className={styles.th}>Hora</div>
        </div>

        {auditLog.map(row => {
          const clr = actionColor[row.action] ?? { bg: 'var(--s2)', color: 'var(--muted)' }
          return (
            <div key={row.id} className={styles.tRow}>
              <div className={styles.actorCell}>{row.actor}</div>
              <div>
                <span className={styles.actionChip} style={{ background: clr.bg, color: clr.color }}>
                  {row.action}
                </span>
              </div>
              <div className={styles.targetCell}>{row.target}</div>
              <div className={styles.ipCell}>{row.ip}</div>
              <div className={styles.timeCell}>{row.time}</div>
            </div>
          )
        })}
      </div>

      <div className={styles.tableFoot}>
        <span className={styles.footTxt}>Mostrando 1–{auditLog.length} de {auditLog.length} eventos</span>
        <div className={styles.pag}>
          <button className={`${styles.pagBtn} ${styles.pagActive}`}>1</button>
          <button className={styles.pagBtn}>2</button>
          <button className={styles.pagBtn} aria-label="Próxima página">
            <i className="ti ti-arrow-right" aria-hidden="true" style={{ fontSize: 12 }} />
          </button>
        </div>
      </div>
    </div>
  )
}
