import { useState } from 'react'
import { Check, Pencil, Plus, Trash2, UserRound, Users } from 'lucide-react'
import type { Cashier } from '../types'
import { EmptyState } from './Ui'

export interface CashierInput {
  id?: string
  name: string
  email: string
  password: string
  active: boolean
}

export default function CashiersView({
  cashiers,
  onSave,
  onDelete,
}: {
  cashiers: Cashier[]
  onSave: (input: CashierInput) => void
  onDelete: (cashier: Cashier) => void
}) {
  const [editing, setEditing] = useState<CashierInput | null>(null)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [active, setActive] = useState(true)

  const openNew = () => {
    setEditing({ name: '', email: '', password: '', active: true })
    setName('')
    setEmail('')
    setPassword('')
    setActive(true)
  }

  const openEdit = (cashier: Cashier) => {
    setEditing({ id: cashier.id, name: cashier.name, email: cashier.email, password: '', active: cashier.active })
    setName(cashier.name)
    setEmail(cashier.email)
    setPassword('')
    setActive(cashier.active)
  }

  const submit = (event: React.FormEvent) => {
    event.preventDefault()
    if (!editing) return
    onSave({ ...editing, name: name.trim(), email: email.trim().toLowerCase(), password, active })
  }

  return (
    <section className="card">
      <div className="card-title">
        <h2><Users size={17} style={{ verticalAlign: -3, marginRight: 6 }} /> Mis cajeros</h2>
        <button className="btn sm" onClick={openNew}><Plus size={14} /> Agregar</button>
      </div>

      {editing && (
        <form className="stack" style={{ padding: 14, borderRadius: 16, background: 'rgba(250,245,232,.7)', marginBottom: 16 }} onSubmit={submit}>
          <div className="row spread">
            <strong className="small">{editing.id ? 'Editar cajero' : 'Nuevo cajero'}</strong>
            <button type="button" className="btn btn-ghost sm" onClick={() => setEditing(null)}>Cancelar</button>
          </div>
          <div className="field">
            <label htmlFor="cashier-name">Nombre</label>
            <input id="cashier-name" className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej. Ana López" required />
          </div>
          <div className="grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <div className="field">
              <label htmlFor="cashier-email">Correo</label>
              <input id="cashier-email" className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="ana@negocio.com" required />
            </div>
            <div className="field">
              <label htmlFor="cashier-password">{editing.id ? 'Nueva contraseña (dejar vacía para conservar)' : 'Contraseña'}</label>
              <input id="cashier-password" className="input" type="password" minLength={4} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Mínimo 4 caracteres" required={!editing.id} />
            </div>
          </div>
          <label className="row small" style={{ gap: 8, cursor: 'pointer' }}>
            <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
            Cuenta activa
          </label>
          <button className="btn btn-gold" type="submit"><Check size={15} /> Guardar cajero</button>
        </form>
      )}

      {cashiers.length === 0 ? (
        <EmptyState icon={<UserRound size={32} />} title="Sin cajeros" text="Crea una cuenta con correo y contraseña para cada persona que atienda la caja." />
      ) : (
        <div className="stack" style={{ gap: 8 }}>
          {cashiers.map((cashier) => (
            <div key={cashier.id} className="row spread" style={{ padding: '10px 12px', borderRadius: 14, background: 'rgba(255,255,255,.7)', border: '1px solid var(--line)' }}>
              <div className="row" style={{ gap: 10 }}>
                <div className="stat-icon" style={{ width: 36, height: 36, borderRadius: 12 }}><UserRound size={17} /></div>
                <div>
                  <strong className="small" style={{ display: 'block' }}>{cashier.name}</strong>
                  <span className="tiny muted">{cashier.email}</span>
                </div>
              </div>
              <div className="row" style={{ gap: 5 }}>
                <span className={`badge ${cashier.active ? 'ok' : 'bad'}`}>{cashier.active ? 'Activo' : 'Inactivo'}</span>
                <button className="icon-btn sm" title="Editar" onClick={() => openEdit(cashier)}><Pencil size={13} /></button>
                <button className="icon-btn sm btn-danger" title="Eliminar" onClick={() => onDelete(cashier)}><Trash2 size={13} /></button>
              </div>
            </div>
          ))}
        </div>
      )}
      <p className="file-hint" style={{ margin: '14px 0 0' }}>
        Las contraseñas se guardan como hash (SHA-256 con sal), nunca en texto plano. Activa "Exigir login" para que solo los cajeros puedan cobrar.
      </p>
    </section>
  )
}
