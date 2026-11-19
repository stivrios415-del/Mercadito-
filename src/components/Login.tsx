import { useState } from 'react'
import { LockKeyhole, LogOut, UserRound } from 'lucide-react'
import type { Session } from '../types'
import { Modal } from './Ui'

export type LoginHandler = (email: string, password: string) => Promise<void>
export type SecondaryAction = { label: string; onClick: () => void }

function LoginForm({
  onLogin,
  onToast,
  submitLabel = 'Ingresar a caja',
}: {
  onLogin: LoginHandler
  onToast: (message: string, error?: boolean) => void
  submitLabel?: string
}) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setBusy(true)
    try {
      await onLogin(email, password)
    } catch (error) {
      onToast(error instanceof Error ? error.message : 'No se pudo iniciar sesión', true)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="stack" onSubmit={submit}>
      <div className="field">
        <label htmlFor="login-email">Correo del cajero</label>
        <input
          id="login-email"
          className="input"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="cajero@negocio.com"
          required
        />
      </div>
      <div className="field">
        <label htmlFor="login-password">Contraseña</label>
        <input
          id="login-password"
          className="input"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="••••••••"
          required
        />
      </div>
      <button className="btn btn-gold btn-lg btn-block" type="submit" disabled={busy}>
        <LockKeyhole size={16} /> {busy ? 'Verificando…' : submitLabel}
      </button>
    </form>
  )
}

export function LoginGate({
  onLogin,
  onToast,
  onOpenSettings,
  secondaryAction,
}: {
  onLogin: LoginHandler
  onToast: (message: string, error?: boolean) => void
  onOpenSettings: () => void
  secondaryAction?: SecondaryAction
}) {
  return (
    <section className="card pad-lg" style={{ maxWidth: 460, margin: '6vh auto' }}>
      <div style={{ textAlign: 'center', marginBottom: 20 }}>
        <div className="brand-mark" style={{ margin: '0 auto 14px' }}><LockKeyhole size={24} /></div>
        <h2 style={{ margin: 0 }}>Inicia sesión para vender</h2>
        <p className="small muted">El dueño activó el ingreso con cajeros.</p>
      </div>
      <LoginForm onLogin={onLogin} onToast={onToast} />
      <div className="divider" />
      <button className="btn btn-ghost btn-block" onClick={secondaryAction?.onClick ?? onOpenSettings}>
        {secondaryAction?.label ?? 'Soy el dueño y quiero cambiar esta opción'}
      </button>
    </section>
  )
}

export function SessionModal({
  session,
  onLogin,
  onLogout,
  onClose,
  onToast,
}: {
  session: Session
  onLogin: LoginHandler
  onLogout: () => void
  onClose: () => void
  onToast: (message: string, error?: boolean) => void
}) {
  return (
    <Modal title="Cajero" subtitle={session.kind === 'owner' ? 'Estás en modo dueño' : `Sesión de ${session.name}`} onClose={onClose}>
      <LoginForm
        onLogin={async (email, password) => {
          await onLogin(email, password)
          onClose()
        }}
        onToast={onToast}
      />
      <div className="divider" />
      {session.kind === 'cashier' && (
        <button className="btn btn-block" onClick={() => { onLogout(); onClose() }}>
          <LogOut size={15} /> Cerrar sesión de cajero
        </button>
      )}
      <p className="file-hint" style={{ marginBottom: 0 }}>
        <UserRound size={12} style={{ verticalAlign: -2 }} /> Los cajeros se crean en Configuración → Mis cajeros.
      </p>
    </Modal>
  )
}
