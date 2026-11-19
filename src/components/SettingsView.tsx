import { useState } from 'react'
import { ImagePlus, LockKeyhole, Palette, ShieldCheck, Store, Trash2, Users } from 'lucide-react'
import type { Cashier, Tenant } from '../types'
import { CURRENCIES } from '../lib/currencies'
import { dueDateLabel, subscriptionBadge, subscriptionStatus, SUBSCRIPTION_LABEL } from '../lib/billing'
import { optimizeImage } from '../lib/image'
import { BrandLogo } from './Ui'
import CashiersView, { type CashierInput } from './CashiersView'

export type TenantUpdates = Pick<Tenant, 'name' | 'logo' | 'ruc' | 'phone' | 'address' | 'currency' | 'taxRate' | 'requireLogin'>

export default function SettingsView({
  tenant,
  cashiers,
  onSave,
  onSaveCashier,
  onDeleteCashier,
  onDelete,
  onSwitch,
  onOpenAdmin,
  isSuperAdmin,
  onToast,
}: {
  tenant: Tenant
  cashiers: Cashier[]
  onSave: (updates: TenantUpdates) => void
  onSaveCashier: (input: CashierInput) => void
  onDeleteCashier: (cashier: Cashier) => void
  onDelete: () => void
  onSwitch: () => void
  onOpenAdmin: () => void
  isSuperAdmin: boolean
  onToast: (message: string, error?: boolean) => void
}) {
  const [name, setName] = useState(tenant.name)
  const [ruc, setRuc] = useState(tenant.ruc ?? '')
  const [phone, setPhone] = useState(tenant.phone ?? '')
  const [address, setAddress] = useState(tenant.address ?? '')
  const [currency, setCurrency] = useState(tenant.currency)
  const [taxRate, setTaxRate] = useState(String(tenant.taxRate))
  const [requireLogin, setRequireLogin] = useState(tenant.requireLogin ?? false)
  const [logo, setLogo] = useState(tenant.logo ?? '')
  const [saving, setSaving] = useState(false)

  const handleLogo = async (file?: File) => {
    if (!file) return
    try {
      setLogo(await optimizeImage(file, { maxSize: 500, quality: 0.9, forcePng: true }))
    } catch (error) {
      onToast(error instanceof Error ? error.message : 'No se pudo leer el logo', true)
    }
  }

  const submit = (event: React.FormEvent) => {
    event.preventDefault()
    if (!name.trim()) return onToast('El nombre del negocio no puede estar vacío', true)
    setSaving(true)
    onSave({
      name: name.trim(),
      logo: logo || undefined,
      ruc: ruc.trim(),
      phone: phone.trim(),
      address: address.trim(),
      currency,
      taxRate: Number(taxRate) || 0,
      requireLogin,
    })
    window.setTimeout(() => setSaving(false), 300)
  }

  return (
    <div className="grid two-col">
      <form className="stack" onSubmit={submit}>
        <section className="card pad-lg">
          <div className="card-title"><h2><Store size={17} style={{ verticalAlign: -3, marginRight: 6 }} /> Identidad del negocio</h2><span className="badge">Tenant</span></div>
          <div className="stack">
            <div className="field">
              <label htmlFor="settings-name">Nombre que aparecerá en facturas y app</label>
              <input id="settings-name" className="input" value={name} onChange={(e) => setName(e.target.value)} required />
            </div>
            <div className="grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
              <div className="field">
                <label htmlFor="settings-ruc">RUC / NIF</label>
                <input id="settings-ruc" className="input" value={ruc} onChange={(e) => setRuc(e.target.value)} />
              </div>
              <div className="field">
                <label htmlFor="settings-phone">Teléfono</label>
                <input id="settings-phone" className="input" value={phone} onChange={(e) => setPhone(e.target.value)} />
              </div>
            </div>
            <div className="field">
              <label htmlFor="settings-address">Dirección</label>
              <input id="settings-address" className="input" value={address} onChange={(e) => setAddress(e.target.value)} />
            </div>
            <div className="grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
              <div className="field">
                <label htmlFor="settings-currency">Moneda</label>
                <select id="settings-currency" className="input" value={currency} onChange={(e) => setCurrency(e.target.value)}>
                  {CURRENCIES.map(({ code, label }) => <option key={code} value={code}>{label}</option>)}
                </select>
              </div>
              <div className="field">
                <label htmlFor="settings-tax">Impuesto %</label>
                <input id="settings-tax" className="input" type="number" min="0" max="100" step="0.5" value={taxRate} onChange={(e) => setTaxRate(e.target.value)} />
              </div>
            </div>
          </div>
        </section>

        <section className="card">
          <div className="card-title"><h2><Palette size={17} style={{ verticalAlign: -3, marginRight: 6 }} /> Logo</h2></div>
          <div className="row" style={{ gap: 18, alignItems: 'center' }}>
            {logo ? <img className="logo-preview" src={logo} alt="Logo actual" /> : <div className="brand-logo" style={{ width: 88, height: 88, fontSize: 32 }}>{name.slice(0, 1)}</div>}
            <div className="stack" style={{ gap: 8 }}>
              <label className="btn btn-gold" style={{ cursor: 'pointer' }}>
                <ImagePlus size={16} /> {logo ? 'Cambiar logo' : 'Subir logo'}
                <input type="file" accept="image/*" hidden onChange={(e) => handleLogo(e.target.files?.[0])} />
              </label>
              {logo && <button type="button" className="btn btn-danger" onClick={() => setLogo('')}>Quitar logo</button>}
              <span className="file-hint">PNG o JPG. Se guarda en este dispositivo y se usa en la factura.</span>
            </div>
          </div>
          <div className="divider" />
          <div className="row" style={{ gap: 10 }}>
            <BrandLogo tenant={{ ...tenant, name, logo }} size={30} />
            <span className="small">Vista previa en la barra superior</span>
          </div>
        </section>

        <button className="btn btn-gold btn-lg" type="submit" disabled={saving}>{saving ? 'Guardando…' : 'Guardar cambios'}</button>
      </form>

      <div className="stack">
        {isSuperAdmin && (
          <section className="card" style={{ borderColor: 'rgba(195, 155, 63, .45)' }}>
            <div className="card-title"><h2><ShieldCheck size={17} style={{ verticalAlign: -3, marginRight: 6 }} /> Multinegocio</h2><span className="badge">Solo administrador</span></div>
            <p className="small muted">Gestiona todos los negocios, quién está al día y a quién bloquear. Cada tienda mantiene su enlace, logo, productos y facturas separados.</p>
            <div className="divider" />
            <div className="stack" style={{ gap: 8 }}>
              <div className="badge">Enlace: mercadito.app/?t={tenant.slug}</div>
              <button type="button" className="btn btn-gold btn-block" onClick={onOpenAdmin}><ShieldCheck size={15} /> Panel de negocios y cobros</button>
              <button type="button" className="btn btn-block" onClick={onSwitch}>Cambiar de negocio</button>
            </div>
          </section>
        )}

        <section className="card">
          <div className="card-title"><h2><LockKeyhole size={17} style={{ verticalAlign: -3, marginRight: 6 }} /> Acceso a caja</h2></div>
          <p className="small muted">Si lo activas, solo los cajeros con correo y contraseña podrán cobrar. Tú siempre puedes entrar como dueño.</p>
          <label className="row spread small" style={{ cursor: 'pointer', padding: '12px 0 0' }}>
            <span className="row" style={{ gap: 8 }}>Exigir login para vender</span>
            <input type="checkbox" checked={requireLogin} onChange={(e) => setRequireLogin(e.target.checked)} />
          </label>
        </section>

        <section className="card">
          <div className="card-title">
            <h2><Store size={17} style={{ verticalAlign: -3, marginRight: 6 }} /> Suscripción</h2>
            <span className={`badge ${subscriptionBadge(subscriptionStatus(tenant))}`}>{SUBSCRIPTION_LABEL[subscriptionStatus(tenant)]}</span>
          </div>
          <p className="small muted" style={{ margin: 0 }}>Vencimiento: <strong>{dueDateLabel(tenant)}</strong>.</p>
          {!['active', 'soon'].includes(subscriptionStatus(tenant)) && (
            <p className="small" style={{ color: '#a34034', margin: '10px 0 0' }}>
              Las ventas están bloqueadas. Comunícate con el administrador del software para regularizar el pago.
            </p>
          )}
        </section>
        <CashiersView cashiers={cashiers} onSave={onSaveCashier} onDelete={onDeleteCashier} />
        <section className="card" style={{ borderColor: 'rgba(163, 64, 52, 0.2)' }}>
          <div className="card-title"><h2 style={{ color: '#a34034' }}>Zona peligrosa</h2></div>
          <p className="small muted">Eliminar este negocio borrará sus productos, stock y facturas guardados en este dispositivo.</p>
          <button type="button" className="btn btn-danger btn-block" onClick={onDelete}><Trash2 size={15} /> Eliminar negocio</button>
        </section>
      </div>
    </div>
  )
}
