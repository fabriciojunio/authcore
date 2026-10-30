import { useCallback, useEffect, useId, useState, type FormEvent } from 'react'
import { useAuthStore } from '../../store/authStore'
import {
  cadastrarPasskey,
  listarPasskeys,
  mensagemDeErroPasskey,
  removerPasskey,
  suportaPasskey,
  type PasskeyResumo,
} from '../../services/passkeys'
import styles from './SettingsPage.module.css'

const formatoData = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' })

export default function PasskeysSection() {
  const isDemo = useAuthStore((s) => s.isDemo)
  const nomeId = useId()
  const [passkeys, setPasskeys] = useState<PasskeyResumo[]>([])
  const [nome, setNome] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  const carregar = useCallback(async () => {
    try {
      setPasskeys(await listarPasskeys())
    } catch (err) {
      setErro(mensagemDeErroPasskey(err, 'Não foi possível carregar as passkeys'))
    }
  }, [])

  useEffect(() => {
    if (!isDemo) void carregar()
  }, [isDemo, carregar])

  const cadastrar = async (event: FormEvent) => {
    event.preventDefault()
    setErro(null)
    setOcupado(true)
    try {
      await cadastrarPasskey(nome.trim() || 'Meu aparelho')
      setNome('')
      await carregar()
    } catch (err) {
      setErro(mensagemDeErroPasskey(err, 'Não foi possível cadastrar a passkey'))
    } finally {
      setOcupado(false)
    }
  }

  const remover = async (passkey: PasskeyResumo) => {
    setErro(null)
    try {
      await removerPasskey(passkey.id)
      setPasskeys((atual) => atual.filter((p) => p.id !== passkey.id))
    } catch (err) {
      setErro(mensagemDeErroPasskey(err, 'Não foi possível remover a passkey'))
    }
  }

  return (
    <div className={styles.section}>
      <div className={styles.secHead}>
        <i className="ti ti-fingerprint" aria-hidden="true" />
        Passkeys
      </div>
      <div className={styles.secBody}>
        {isDemo ? (
          <div className={styles.row}>
            <div className={styles.rowDesc}>Indisponível no modo demonstração: a passkey fica guardada no servidor.</div>
          </div>
        ) : (
          <>
            {erro && <div role="alert" className={`${styles.row} ${styles.rowError}`}>{erro}</div>}

            {passkeys.map((p) => (
              <div key={p.id} className={styles.row}>
                <div className={styles.rowInfo}>
                  <div className={styles.rowLabel}>{p.name}</div>
                  <div className={styles.rowDesc}>
                    Criada em {formatoData.format(new Date(p.createdAt))}
                    {p.lastUsedAt ? ` · último uso em ${formatoData.format(new Date(p.lastUsedAt))}` : ' · nunca usada'}
                  </div>
                </div>
                <button type="button" className={styles.btnSmall} onClick={() => void remover(p)}>
                  Remover
                </button>
              </div>
            ))}

            {suportaPasskey() ? (
              <form className={styles.row} onSubmit={(e) => void cadastrar(e)}>
                <div className={styles.rowInfo}>
                  <label htmlFor={nomeId} className={styles.rowLabel}>Nova passkey</label>
                  <input
                    id={nomeId}
                    className={styles.input}
                    value={nome}
                    maxLength={60}
                    placeholder="Ex.: notebook do trabalho"
                    onChange={(e) => setNome(e.target.value)}
                  />
                </div>
                <button type="submit" className={styles.btnSmall} disabled={ocupado} aria-busy={ocupado}>
                  Cadastrar
                </button>
              </form>
            ) : (
              <div className={styles.row}>
                <div className={styles.rowDesc}>Este navegador não tem suporte a passkeys.</div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
