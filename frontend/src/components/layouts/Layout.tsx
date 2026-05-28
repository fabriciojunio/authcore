import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../../store/authStore'
import { useNotificationStore } from '../../store/notificationStore'
import { useWebSocket } from '../../hooks/useWebSocket'
import styles from './Layout.module.css'

const navGroups = [
  {
    label: 'Principal',
    items: [
      { to: '/dashboard', icon: 'ti-layout-dashboard', label: 'Overview' },
      { to: '/users',     icon: 'ti-users',            label: 'Usuários' },
    ],
  },
  {
    label: 'Sistema',
    items: [
      { to: '/audit',    icon: 'ti-shield-check', label: 'Auditoria' },
      { to: '/settings', icon: 'ti-settings',     label: 'Configurações' },
    ],
  },
]

export function Layout() {
  const { user, isDemo, logout } = useAuthStore()
  const { unreadCount }          = useNotificationStore()
  const navigate                 = useNavigate()
  const { isConnected }          = useWebSocket()

  const handleLogout = async () => {
    await logout()
    navigate('/login')
  }

  const ini = user?.name
    .split(' ')
    .map(n => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2) ?? '?'

  const now = new Date().toLocaleDateString('pt-BR', {
    weekday: 'short', day: '2-digit', month: 'short', year: 'numeric',
  })

  return (
    <div className={styles.root}>
      <a href="#main-content" className={styles.skipLink}>Ir para o conteúdo</a>

      <aside className={styles.sidebar} role="navigation" aria-label="Navegação principal">
        <div className={styles.brand}>
          <div className={styles.brandMark}>Enterprise</div>
          <div className={styles.brandSub}>Painel de controle</div>
        </div>

        <nav className={styles.nav} aria-label="Menu">
          {navGroups.map(group => (
            <div key={group.label} className={styles.navGroup}>
              <div className={styles.navGroupLabel}>{group.label}</div>
              {group.items.map(item => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) =>
                    `${styles.navItem} ${isActive ? styles.active : ''}`
                  }
                >
                  <i className={`ti ${item.icon} ${styles.navIcon}`} aria-hidden="true" />
                  {item.label}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>

        <div className={styles.userSection}>
          <div className={styles.userRow}>
            <div className={styles.avatar} role="img" aria-label={`Avatar de ${user?.name}`}>
              {ini}
            </div>
            <div className={styles.userInfo}>
              <div className={styles.userName}>{user?.name}</div>
              <div className={styles.userRole}>{user?.role}</div>
            </div>
            <button className={styles.iconBtn} onClick={handleLogout} aria-label="Sair da conta">
              <i className="ti ti-logout" aria-hidden="true" />
            </button>
          </div>
        </div>
      </aside>

      <div className={styles.main}>
        <header className={styles.topbar}>
          <span className={styles.topbarTitle}>
            {navGroups.flatMap(g => g.items).find(i => location.pathname.startsWith(i.to))?.label ?? 'Overview'}
          </span>
          <div className={styles.topbarRight}>
            <span className={styles.topbarDate}>{now}</span>
            <div className={styles.topbarDivider} />
            <button className={styles.notifBtn} aria-label={`${unreadCount} notificações`}>
              <i className="ti ti-bell" aria-hidden="true" />
              {unreadCount > 0 && (
                <span className={styles.notifBadge}>{unreadCount > 9 ? '9+' : unreadCount}</span>
              )}
            </button>
            <button className={styles.iconBtn} aria-label="Configurações">
              <i className="ti ti-settings" aria-hidden="true" />
            </button>
          </div>
        </header>

        {isDemo ? (
          <div className={styles.demoBanner}>
            <i className="ti ti-info-circle" aria-hidden="true" />
            Modo demonstração — dados fictícios, sem conexão com o servidor
          </div>
        ) : (
          <div className={styles.wsStrip}>
            <span className={isConnected ? styles.wsDot : undefined}
              style={!isConnected ? { width: 6, height: 6, borderRadius: '50%', background: 'var(--yellow)', flexShrink: 0 } : undefined} />
            <span className={styles.wsLabel}>{isConnected ? 'WebSocket ativo' : 'Reconectando…'}</span>
            <span className={styles.wsSep} />
            <span className={styles.wsInfo}>Notificações em tempo real habilitadas</span>
          </div>
        )}

        <main id="main-content" className={styles.pageContent} tabIndex={-1}>
          <Outlet />
        </main>
      </div>
    </div>
  )
}
