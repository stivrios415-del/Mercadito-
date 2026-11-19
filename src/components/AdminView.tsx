import { useCallback, useEffect, useState } from 'react'
import { CalendarDays, CheckCircle2, ExternalLink, LockKeyhole, RefreshCw, ShieldCheck } from 'lucide-react'
import type { Tenant } from '../types'
import type { AdminTenant } from '../lib/remote'
import { dueDateLabel, subscriptionBadge, subscriptionStatus, SUBSCRIPTION_LABEL } from '../lib/billing'
import { money } from '../lib/format'
import { EmptyState } from './Ui'

const DAY = 24 * 60 * 60 * 1000

function toDateInput(value: number | null) {
  if (value == null) return ''
  const date = new Date(value)
  const pad = (part: number) => String(part).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

function parseDateInput(value: string) {
  if (!value) return null
  return new Date(`${value}T23:59:59`).getTime()
}

/** Las utilidades de suscripción esperan un Tenant; aquí solo importan estos campos. */
const asTenant = (row: AdminTenant): Tenant => ({
  id: row.id,
  slug: row.slug,
  name: row.name,
  currency: row.currency,
  taxRate: 0,
  paidUntil: row.paidUntil,
  blocked: row.blocked,
  createdAt: row.createdAt,
})

export default function AdminView({
  onLoad,
  onSave,
  onOpen,
  onToast,
}: {
  onLoad: () => Promise<AdminTenant[]>
  onSave: (id: string, paidUntil: number | null, blocked: boolean) => Promise<void>
  onOpen: (id: string) => void
  onToast: (message: string, error?: boolean) => void
}) {
  const [rows, setRows] = useState<AdminTenant[]>([])
  const [loading, setLoading] = useState(true)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draftDate, setDraftDate] = useState('')
  const [savingId, setSavingId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setRows(await onLoad())
    } catch (error) {
      onToast(error instanceof Error ? error.message : 'No se pudo cargar la lista de negocios', true)
    } finally {
      setLoading(false)
    }
  }, [onLoad, onToast])

  useEffect(() => {
    void load()
  }, [load])

  const save = async (row: AdminTenant, paidUntil: number | null, blocked: boolean, message: string) => {
    setSavingId(row.id)
    try {
      await onSave(row.id, paidUntil, blocked)
      onToast(message)
      await load()
    } catch (error) {
      onToast(error instanceof Error ? error.message : 'No se pudo guardar el estado del negocio', true)
    } finally {
      setSavingId(null)
      setEditingId(null)
    }
  }

  const active = rows.filter((row) => ['active', 'soon'].includes(subscriptionStatus(asTenant(row)))).length
  const inactive = rows.length - active

  return (
    <div className="stack" style={{ gap: 16 }}>
      <section className="card pad-lg" style={{ borderColor: 'rgba(195, 155, 63, .45)' }}>
        <div className="card-title">
          <h2><ShieldCheck size={18} style={{ verticalAlign: -3, marginRight: 6 }} /> Panel del dueño del software</h2>
          <button className="btn sm" onClick={() => void load()} disabled={loading}><RefreshCw size={14} /> Actualizar</button>
        </div>
        <p className="small muted" style={{ margin: 0 }}>
          Vista privada: solo la cuenta administradora puede ver todos los negocios y decidir quién está al día. Un negocio vencido o bloqueado puede consultar sus datos, pero no puede cobrar ventas.
        </p>
        <div className="grid stat-grid" style={{ marginTop: 16 }}>
          <div className="card stat" style={{ padding: 12 }}><div className="stat-icon"><ShieldCheck size={18} /></div><div><div className="stat-value">{rows.length}</div><div className="stat-label">Negocios registrados</div></div></div>
          <div className="card stat" style={{ padding: 12 }}><div className="stat-icon"><CheckCircle2 size={18} /></div><div><div className="stat-value">{active}</div><div className="stat-label">Activos</div></div></div>
          <div className="card stat" style={{ padding: 12 }}><div className="stat-icon" style={{ color: '#a34034', background: 'rgba(255,230,226,.9)' }}><LockKeyhole size={18} /></div><div><div className="stat-value" style={{ color: '#a34034' }}>{inactive}</div><div className="stat-label">Vencidos o bloqueados</div></div></div>
        </div>
      </section>

      <section className="card">
        <div className="card-title"><h2>Control de pagos</h2><span className="badge">{rows.length} negocios</span></div>
        {loading ? (
          <p className="small muted">Cargando negocios…</p>
        ) : rows.length === 0 ? (
          <EmptyState icon={<ShieldCheck size={34} />} title="Todavía no hay negocios" text="Cuando un dueño cree su tienda aparecerá aquí para activarla." />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Negocio</th>
                  <th>Dueño</th>
                  <th>Estado</th>
                  <th>Vencimiento</th>
                  <th className="num">Ventas</th>
                  <th className="num">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const status = subscriptionStatus(asTenant(row))
                  const editing = editingId === row.id
                  return (
                    <tr key={row.id}>
                      <td><div className="strong">{row.name}</div><div className="tiny muted">?t={row.slug}</div></td>
                      <td className="small">{row.ownerEmail ?? '—'}<div className="tiny muted">{row.productsCount} productos · {row.invoicesCount} facturas</div></td>
                      <td><span className={`badge ${subscriptionBadge(status)}`}>{SUBSCRIPTION_LABEL[status]}</span></td>
                      <td className="small">
                        {editing ? (
                          <input className="input" type="date" style={{ minWidth: 150 }} value={draftDate} onChange={(event) => setDraftDate(event.target.value)} />
                        ) : (
                          <span className="muted">{dueDateLabel(asTenant(row))}</span>
                        )}
                      </td>
                      <td className="num strong">{money(row.totalSales, row.currency)}</td>
                      <td className="num">
                        <div className="row wrap" style={{ justifyContent: 'flex-end', gap: 4 }}>
                          <button
                            className="btn sm"
                            disabled={savingId === row.id}
                            title="Cobrar 30 días"
                            onClick={() => void save(row, Date.now() + 30 * DAY, false, `30 días de acceso concedidos a ${row.name}`)}
                          >
                            <CalendarDays size={13} /> Cobrar
                          </button>
                          <button
                            className="btn sm"
                            disabled={savingId === row.id || !editing}
                            onClick={() => void save(row, parseDateInput(draftDate), row.blocked, `Vencimiento actualizado para ${row.name}`)}
                          >
                            Guardar fecha
                          </button>
                          <button
                            className={`btn sm ${row.blocked ? '' : 'btn-danger'}`}
                            disabled={savingId === row.id}
                            onClick={() => void save(row, row.paidUntil, !row.blocked, row.blocked ? `${row.name} desbloqueado` : `${row.name} bloqueado`)}
                          >
                            {row.blocked ? 'Desbloquear' : 'Bloquear'}
                          </button>
                          <button className="btn sm" onClick={() => onOpen(row.id)} title="Abrir este negocio"><ExternalLink size={13} /></button>
                          <button
                            className="btn sm btn-ghost"
                            onClick={() => { setEditingId(editing ? null : row.id); setDraftDate(toDateInput(row.paidUntil)) }}
                            title="Editar fecha manual"
                          >
                            {editing ? 'Cancelar' : 'Fecha'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
