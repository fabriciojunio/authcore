import styles from './SettingsPage.module.css'

const sections = [
  {
    title: 'Segurança',
    icon: 'ti-shield-lock',
    rows: [
      { label: 'Autenticação de dois fatores', desc: 'Exige 2FA para todos os usuários admin', value: 'Ativado', on: true },
      { label: 'Expiração de sessão', desc: 'Tempo máximo de inatividade antes do logout', value: '30 min' },
      { label: 'Tentativas de login', desc: 'Bloqueio após N tentativas falhas', value: '5 tentativas' },
      { label: 'IP allowlist', desc: 'Restringir acesso a IPs específicos', value: 'Desativado', on: false },
    ],
  },
  {
    title: 'Notificações',
    icon: 'ti-bell',
    rows: [
      { label: 'Alertas de segurança', desc: 'Enviar e-mail em logins suspeitos', value: 'Ativado', on: true },
      { label: 'Resumo semanal', desc: 'Relatório de atividades toda segunda-feira', value: 'Ativado', on: true },
      { label: 'Notificações em tempo real', desc: 'WebSocket para eventos ao vivo', value: 'Ativado', on: true },
    ],
  },
  {
    title: 'Sistema',
    icon: 'ti-server',
    rows: [
      { label: 'Retenção de logs', desc: 'Por quanto tempo manter registros de auditoria', value: '90 dias' },
      { label: 'Fuso horário', desc: 'Fuso padrão para datas e relatórios', value: 'America/Sao_Paulo' },
      { label: 'Idioma padrão', desc: 'Idioma da interface para novos usuários', value: 'Português (BR)' },
    ],
  },
]

export default function SettingsPage() {
  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <div className={styles.pageTitle}>Configurações</div>
        <div className={styles.pageSub}>Gerencie as preferências e políticas da plataforma</div>
      </div>

      <div className={styles.sections}>
        {sections.map(sec => (
          <div key={sec.title} className={styles.section}>
            <div className={styles.secHead}>
              <i className={`ti ${sec.icon}`} aria-hidden="true" />
              {sec.title}
            </div>
            <div className={styles.secBody}>
              {sec.rows.map(row => (
                <div key={row.label} className={styles.row}>
                  <div className={styles.rowInfo}>
                    <div className={styles.rowLabel}>{row.label}</div>
                    <div className={styles.rowDesc}>{row.desc}</div>
                  </div>
                  <div className={styles.rowVal}>
                    {row.on !== undefined ? (
                      <div className={`${styles.toggle} ${row.on ? styles.toggleOn : ''}`}>
                        <div className={styles.toggleKnob} />
                      </div>
                    ) : (
                      <span className={styles.valChip}>{row.value}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
