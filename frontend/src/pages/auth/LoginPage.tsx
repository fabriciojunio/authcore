import { useId } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Link } from 'react-router-dom'
import { useAuthStore } from '../../store/authStore'
import styles from '../AuthPage.module.css'

const schema = z.object({
  email:    z.string().email('E-mail inválido'),
  password: z.string().min(1, 'Senha obrigatória'),
})
type FormData = z.infer<typeof schema>

const stats = [
  { n: '2.4k',  l: 'usuários ativos' },
  { n: '99.9%', l: 'uptime mensal' },
  { n: '<50ms', l: 'latência ws' },
]

export default function LoginPage() {
  const { login, loginAsDemo, isLoading, error, clearError } = useAuthStore()
  const emailId = useId()
  const passId  = useId()

  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
  })

  const onSubmit = async (data: FormData) => {
    clearError()
    await login(data.email, data.password)
  }

  return (
    <div className={styles.page}>
      <div className={styles.left}>
        <div className={styles.wordmark}>AuthCore</div>

        <div className={styles.leftMid}>
          <h1 className={styles.headline}>
            Controle total,<br />
            <em className={styles.headlineEm}>visibilidade real.</em>
          </h1>
          <p className={styles.sub}>
            Gerencie equipes, acesse métricas em tempo real e audite cada ação com rastreabilidade completa.
          </p>
        </div>

        <div className={styles.statsRow}>
          {stats.map((s, i) => (
            <div key={s.l} style={{ display: 'flex', alignItems: 'center', flex: 1 }}>
              {i > 0 && <div className={styles.statDiv} />}
              <div className={styles.stat} style={i > 0 ? { paddingLeft: 20 } : {}}>
                <div className={styles.statN}>{s.n}</div>
                <div className={styles.statL}>{s.l}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className={styles.right}>
        <div className={styles.formWrap}>
          <div className={styles.liveRow}>
            <div className={styles.liveDot} />
            <span className={styles.liveTxt}>Sistema operacional</span>
          </div>

          {error && (
            <div role="alert" aria-live="assertive" className={styles.errorBanner}>
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit(onSubmit)} noValidate>
            <div className={styles.field}>
              <label htmlFor={emailId} className={styles.fieldLabel}>E-mail</label>
              <input
                id={emailId}
                type="email"
                className={styles.fieldInp}
                placeholder="voce@empresa.com"
                autoComplete="email"
                aria-required="true"
                aria-invalid={!!errors.email}
                {...register('email')}
              />
              {errors.email && <span className={styles.fieldError} role="alert">{errors.email.message}</span>}
            </div>

            <div className={styles.field}>
              <label htmlFor={passId} className={styles.fieldLabel}>Senha</label>
              <input
                id={passId}
                type="password"
                className={styles.fieldInp}
                placeholder="••••••••"
                autoComplete="current-password"
                aria-required="true"
                aria-invalid={!!errors.password}
                {...register('password')}
              />
              {errors.password && <span className={styles.fieldError} role="alert">{errors.password.message}</span>}
              <div className={styles.fieldHint}>Esqueceu? Contate o administrador</div>
            </div>

            <div className={styles.actions}>
              <button
                type="submit"
                className={styles.btnPrimary}
                disabled={isLoading}
                aria-busy={isLoading}
              >
                {isLoading ? <span className={styles.spinner} /> : 'Entrar'}
              </button>
              <Link to="/register" className={styles.btnLink}>Criar conta</Link>
            </div>
          </form>

          <div className={styles.divider}>
            <div className={styles.divLine} />
            <span className={styles.divTxt}>ou</span>
            <div className={styles.divLine} />
          </div>

          <button className={styles.btnDemo} onClick={loginAsDemo} type="button">
            <i className="ti ti-player-play" aria-hidden="true" />
            Entrar como demonstração
          </button>
          <p className={styles.demoHint}>Acesso completo sem cadastro · dados fictícios</p>
        </div>
      </div>
    </div>
  )
}
