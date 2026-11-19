import { useState } from 'react'
import { LockKeyhole, ShoppingBasket } from 'lucide-react'
import { signIn, signUpOwner } from '../lib/remote'

export default function AuthScreen({
  onAuthenticated,
  onToast,
}: {
  onAuthenticated: () => void
  onToast: (message: string, error?: boolean) => void
}) {
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [confirmation, setConfirmation] = useState(false)

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setBusy(true)
    try {
      if (mode === 'signup') {
        const data = await signUpOwner(email, password, name)
        if (!data.session) {
          setConfirmation(true)
          return
        }
      } else {
        await signIn(email, password)
      }
      onAuthenticated()
    } catch (error) {
      onToast(error instanceof Error ? error.message : 'No se pudo completar la acción', true)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="onboarding" style={{ minHeight: '100vh' }}>
      <div className="onboarding-card" style={{ maxWidth: 440 }}>
        <div className="brand-mark" style={{ margin: '0 auto 14px' }}><ShoppingBasket size={26} /></div>
        <h1 style={{ margin: '0 0 6px' }}>Mercadito ROMO</h1>
        <p className="small muted" style={{ margin: '0 0 20px' }}>
          {mode === 'login' ? 'Ingresa para ver tus negocios.' : 'Crea tu cuenta de dueño.'}
        </p>

        {confirmation ? (
          <div className="stack">
            <p className="small">Te enviamos un correo de confirmación. Ábrelo y vuelve a ingresar.</p>
            <button className="btn btn-block" onClick={() => { setConfirmation(false); setMode('login') }}>
              Ya confirmé, ingresar
            </button>
          </div>
        ) : (
          <form className="stack" onSubmit={submit}>
            {mode === 'signup' && (
              <div className="field">
                <label htmlFor="auth-name">Tu nombre</label>
                <input
                  id="auth-name"
                  className="input"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Nombre del dueño"
                  required
                />
              </div>
            )}
            <div className="field">
              <label htmlFor="auth-email">Correo</label>
              <input
                id="auth-email"
                className="input"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="tu@correo.com"
                required
              />
            </div>
            <div className="field">
              <label htmlFor="auth-password">Contraseña</label>
              <input
                id="auth-password"
                className="input"
                type="password"
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Mínimo 6 caracteres"
                required
              />
            </div>
            <button className="btn btn-gold btn-lg btn-block" type="submit" disabled={busy}>
              <LockKeyhole size={16} /> {busy ? 'Un momento…' : mode === 'login' ? 'Ingresar' : 'Crear cuenta'}
            </button>
          </form>
        )}

        <div className="divider" />
        <button
          className="btn btn-ghost btn-block"
          onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setConfirmation(false) }}
        >
          {mode === 'login' ? 'No tengo cuenta: crear una' : 'Ya tengo cuenta: ingresar'}
        </button>
      </div>
    </div>
  )
}
