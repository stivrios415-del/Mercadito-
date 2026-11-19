import { useState } from 'react'
import { ArrowRight, ShoppingBasket, Sparkles, Store } from 'lucide-react'
import type { Tenant } from '../types'
import { BrandLogo } from './Ui'

export interface NewTenantInput {
  name: string
  currency: string
  taxRate: number
  ruc: string
  phone: string
  address: string
}

export default function Onboarding({
  tenants,
  onCreate,
  onOpen,
}: {
  tenants: Tenant[]
  onCreate: (input: NewTenantInput) => void
  onOpen: (tenant: Tenant) => void
}) {
  const [name, setName] = useState('')
  const [currency, setCurrency] = useState('USD')
  const [taxRate, setTaxRate] = useState('0')
  const [ruc, setRuc] = useState('')
  const [phone, setPhone] = useState('')
  const [address, setAddress] = useState('')

  const submit = (event: React.FormEvent) => {
    event.preventDefault()
    if (!name.trim()) return
    onCreate({ name: name.trim(), currency, taxRate: Number(taxRate) || 0, ruc, phone, address })
  }

  return (
    <div className="onboarding">
      <div className="onboarding-inner">
        <div className="onboarding-hero">
          <div className="brand-mark"><ShoppingBasket size={30} /></div>
          <h1>Mercadito ROMO</h1>
          <p>Tu supermercado o pulpería, listo para vender: escanea productos, toma foto, controla stock y entrega facturas en PDF o impresora Bluetooth.</p>
        </div>

        <div className="grid two-col">
          {tenants.length > 0 && (
            <section className="card pad-lg">
              <div className="card-title"><h2>Mis negocios</h2><span className="badge">{tenants.length}</span></div>
              <div className="stack">
                {tenants.map((tenant) => (
                  <button key={tenant.id} className="tenant-card" onClick={() => onOpen(tenant)}>
                    <BrandLogo tenant={tenant} size={44} />
                    <span style={{ flex: 1 }}>
                      <strong style={{ display: 'block' }}>{tenant.name}</strong>
                      <small className="muted">mercadito.app/?t={tenant.slug}</small>
                    </span>
                    <ArrowRight size={18} className="muted" />
                  </button>
                ))}
              </div>
            </section>
          )}

          <form className="card pad-lg stack" onSubmit={submit}>
            <div className="card-title" style={{ marginBottom: 0 }}>
              <h2>{tenants.length ? 'Agregar otro negocio' : 'Crear mi negocio'}</h2>
              <Sparkles size={18} className="muted" />
            </div>
            <div className="field">
              <label htmlFor="tenant-name">Nombre del supermercado o pulpería</label>
              <input id="tenant-name" className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej. Pulpería La Esquina" autoFocus required />
            </div>
            <div className="grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
              <div className="field">
                <label htmlFor="tenant-currency">Moneda</label>
                <select id="tenant-currency" className="input" value={currency} onChange={(e) => setCurrency(e.target.value)}>
                  {['USD', 'EUR', 'ARS', 'BOB', 'CLP', 'COP', 'MXN', 'PEN', 'UYU'].map((code) => <option key={code}>{code}</option>)}
                </select>
              </div>
              <div className="field">
                <label htmlFor="tenant-tax">Impuesto %</label>
                <input id="tenant-tax" className="input" type="number" min="0" max="100" step="0.5" value={taxRate} onChange={(e) => setTaxRate(e.target.value)} />
              </div>
            </div>
            <div className="field">
              <label htmlFor="tenant-ruc">RUC / NIF (opcional)</label>
              <input id="tenant-ruc" className="input" value={ruc} onChange={(e) => setRuc(e.target.value)} placeholder="123456789-0" />
            </div>
            <div className="field">
              <label htmlFor="tenant-phone">Teléfono (opcional)</label>
              <input id="tenant-phone" className="input" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="7000 0000" />
            </div>
            <div className="field">
              <label htmlFor="tenant-address">Dirección (opcional)</label>
              <input id="tenant-address" className="input" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Av. Central 123" />
            </div>
            <button className="btn btn-gold btn-lg btn-block" type="submit" disabled={!name.trim()}>
              <Store size={17} /> Crear y entrar
            </button>
            {tenants.length === 0 && (
              <button className="btn btn-ghost btn-block" type="button" onClick={() => onCreate({ name: 'Demo Market', currency, taxRate: 0, ruc: '', phone: '', address: '' })}>
                Probar con negocio de ejemplo
              </button>
            )}
            <p className="file-hint" style={{ margin: 0 }}>Podrás cambiar el nombre, el logo y los datos cuando quieras desde Configuración.</p>
          </form>
        </div>
      </div>
    </div>
  )
}
