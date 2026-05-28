import { useId } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Link } from 'react-router-dom'
import { useAuthStore } from '../../store/authStore'
import styles from '../AuthPage.module.css'

const schema = z.object({
  firstName: z.string().min(2, 'Mínimo 2 caracteres'),
  lastName:  z.string().min(2, 'Mínimo 2 caracteres'),
  email:     z.string().email('E-mail inválido'),
  password:  z.string()
    .min(8, 'Mínimo 8 caracteres')
    .regex(/[A-Z]/, 'Adicione uma letra maiúscula')
    .regex(/[0-9]/, 'Adicione um número')
    .regex(/[^A-Za-z0-9]/, 'Adicione um caractere especial'),
  confirm: z.string(),
}).refine(d => d.password === d.confirm, {
  message: 'As senhas não coincidem',
  path: ['confirm'],
})
type FormData = z.infer<typeof schema>

const checks = [
  'JWT com refresh token automático',
  'Controle de acesso por papel',
  'Notificações em tempo real',
  'Auditoria de todas as ações',
]

function strengthLevel(pw: string): number {
  let s = 0
  if (pw.length >= 8)           s++
  if (/[A-Z]/.test(pw))         s++
  if (/[0-9]/.test(pw))         s++
  if (/[^A-Za-z0-9]/.test(pw))  s++
  return s
}

export default function RegisterPage() {
  const { register: registerUser, isLoading, error, clearError } = useAuthStore()
  const firstId = useId(); const lastId = useId()
  const emailId = useId(); const passId = useId(); const confId = useId()

  const { register, handleSubmit, watch, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
  })

  const pw = watch('password') ?? ''
  const strength = strengthLevel(pw)
  const strengthLabel = ['', 'Fraca', 'Razoável', 'Boa', 'Forte'][strength]

  const onSubmit = async (data: FormData) => {
    clearError()
    await registerUser(`${data.firstName} ${data.lastName}`, data.email, data.password)
  }

  return (
    <div className={styles.page}>
      <div className={styles.left}>
        <div className={styles.wordmark}>Enterprise Platform</div>

        <div className={styles.leftMid}>
          <h1 className={styles.headline}>
            Comece agora.<br />
            <em className={styles.headlineEm}>Sem complicação.</em>
          </h1>
          <p className={styles.sub}>
            Crie sua conta e tenha acesso imediato ao painel de controle completo da plataforma.
          </p>
          <div className={styles.checklist}>
            {checks.map(c => (
              <div key={c} className={styles.checkItem}>
                <div className={styles.checkIco}>✓</div>
                {c}
              </div>
            ))}
          </div>
        </div>

        <div className={styles.leftFoot}>
          Já tem conta? <Link to="/login">Entrar</Link>
        </div>
      </div>

      <div className={styles.right}>
        <div className={styles.formWrap}>
          <div className={styles.formTitle}>Criar conta</div>
          <div className={styles.formSub}>Preencha os dados para começar</div>

          {error && (
            <div role="alert" aria-live="assertive" className={styles.errorBanner}>{error}</div>
          )}

          <form onSubmit={handleSubmit(onSubmit)} noValidate>
            <div className={styles.row2}>
              <div className={styles.field}>
                <label htmlFor={firstId} className={styles.fieldLabel}>Nome</label>
                <input id={firstId} type="text" className={styles.fieldInp} placeholder="João" autoComplete="given-name" aria-required="true" {...register('firstName')} />
                {errors.firstName && <span className={styles.fieldError} role="alert">{errors.firstName.message}</span>}
              </div>
              <div className={styles.field}>
                <label htmlFor={lastId} className={styles.fieldLabel}>Sobrenome</label>
                <input id={lastId} type="text" className={styles.fieldInp} placeholder="Silva" autoComplete="family-name" aria-required="true" {...register('lastName')} />
                {errors.lastName && <span className={styles.fieldError} role="alert">{errors.lastName.message}</span>}
              </div>
            </div>

            <div className={styles.field}>
              <label htmlFor={emailId} className={styles.fieldLabel}>E-mail corporativo</label>
              <input id={emailId} type="email" className={styles.fieldInp} placeholder="joao@empresa.com" autoComplete="email" aria-required="true" {...register('email')} />
              {errors.email && <span className={styles.fieldError} role="alert">{errors.email.message}</span>}
            </div>

            <div className={styles.field}>
              <label htmlFor={passId} className={styles.fieldLabel}>Senha</label>
              <input id={passId} type="password" className={styles.fieldInp} placeholder="••••••••" autoComplete="new-password" aria-required="true" {...register('password')} />
              {pw && (
                <div className={styles.strength}>
                  <div className={styles.strengthBars}>
                    {[1,2,3,4].map(i => (
                      <div key={i} className={`${styles.sBar} ${i <= strength ? styles.sBarOn : ''}`} />
                    ))}
                  </div>
                  {strengthLabel && <div className={styles.strengthTxt}>{strengthLabel}</div>}
                </div>
              )}
              {errors.password && <span className={styles.fieldError} role="alert">{errors.password.message}</span>}
            </div>

            <div className={styles.field} style={{ marginBottom: 8 }}>
              <label htmlFor={confId} className={styles.fieldLabel}>Confirmar senha</label>
              <input id={confId} type="password" className={styles.fieldInp} placeholder="••••••••" autoComplete="new-password" aria-required="true" {...register('confirm')} />
              {errors.confirm && <span className={styles.fieldError} role="alert">{errors.confirm.message}</span>}
            </div>

            <button type="submit" className={styles.btnPrimaryFull} disabled={isLoading} aria-busy={isLoading}>
              {isLoading ? <span className={styles.spinner} /> : 'Criar conta'}
            </button>

            <div className={styles.terms}>
              Ao criar uma conta você concorda com os <a href="#">termos de uso</a><br />
              e <a href="#">política de privacidade</a>.
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
