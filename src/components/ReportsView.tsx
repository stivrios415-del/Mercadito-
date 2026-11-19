import { useMemo, useState } from 'react'
import { BarChart3, Download, FileSpreadsheet, FileText, TrendingDown, TrendingUp, Wallet } from 'lucide-react'
import type { Invoice, LossReason, Period, Product, StockLoss, Tenant } from '../types'
import { dateLabel, money } from '../lib/format'
import { buildReport, defaultDateInput, type ReportData } from '../lib/report'
import { EmptyState } from './Ui'

const PERIODS: { value: Period; label: string }[] = [
  { value: 'diario', label: 'Diario' },
  { value: 'semanal', label: 'Semanal' },
  { value: 'mensual', label: 'Mensual' },
]

const REASONS: LossReason[] = ['Daño', 'Vencimiento', 'Robo', 'Otro']

export type LossInput = {
  productId: string
  qty: number
  reason: LossReason
  note?: string
}

function Stat({ label, value, icon, tone }: { label: string; value: string; icon?: React.ReactNode; tone?: 'good' | 'bad' }) {
  return (
    <div className="card stat" style={{ padding: 14 }}>
      <div className="stat-icon" style={tone === 'bad' ? { color: '#a34034', background: 'rgba(255,230,226,.9)' } : undefined}>
        {icon ?? <Wallet size={19} />}
      </div>
      <div style={{ minWidth: 0 }}>
        <div className="stat-value" style={tone === 'bad' ? { color: '#a34034' } : undefined}>{value}</div>
        <div className="stat-label">{label}</div>
      </div>
    </div>
  )
}

export default function ReportsView({
  tenant,
  products,
  invoices,
  losses,
  onRecordLoss,
  onToast,
}: {
  tenant: Tenant
  products: Product[]
  invoices: Invoice[]
  losses: StockLoss[]
  onRecordLoss: (input: LossInput) => Promise<void>
  onToast: (message: string, error?: boolean) => void
}) {
  const [period, setPeriod] = useState<Period>('mensual')
  const [date, setDate] = useState(defaultDateInput())
  const [productId, setProductId] = useState('')
  const [qty, setQty] = useState('1')
  const [reason, setReason] = useState<LossReason>('Daño')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState<'pdf' | 'excel' | null>(null)

  const report: ReportData = useMemo(
    () => buildReport({ period, date, invoices, products, losses, currency: tenant.currency }),
    [period, date, invoices, products, losses, tenant.currency],
  )

  const exportPdf = async () => {
    setBusy('pdf')
    try {
      const { downloadReportPdf } = await import('../lib/pdf')
      downloadReportPdf(tenant, report)
    } catch (error) {
      onToast(error instanceof Error ? error.message : 'No se pudo generar el PDF', true)
    } finally {
      setBusy(null)
    }
  }

  const exportExcel = async () => {
    setBusy('excel')
    try {
      const { downloadReportExcel } = await import('../lib/excel')
      await downloadReportExcel(tenant, report)
    } catch (error) {
      onToast(error instanceof Error ? error.message : 'No se pudo generar el Excel', true)
    } finally {
      setBusy(null)
    }
  }

  const submitLoss = async (event: React.FormEvent) => {
    event.preventDefault()
    const parsedQty = Number(qty)
    if (!productId) return onToast('Elige el producto de la merma', true)
    if (!Number.isInteger(parsedQty) || parsedQty <= 0) return onToast('La cantidad debe ser un número entero', true)
    try {
      await onRecordLoss({ productId, qty: parsedQty, reason, note: note.trim() || undefined })
      setQty('1')
      setNote('')
      onToast('Pérdida registrada y stock actualizado')
    } catch (error) {
      onToast(error instanceof Error ? error.message : 'No se pudo registrar la pérdida', true)
    }
  }

  return (
    <div className="stack" style={{ gap: 16 }}>
      <section className="card pad-lg">
        <div className="card-title">
          <h2><BarChart3 size={17} style={{ verticalAlign: -3, marginRight: 6 }} /> Reporte de ventas</h2>
          <span className="badge">{report.invoiceCount} facturas</span>
        </div>
        <div className="row wrap" style={{ gap: 12 }}>
          <div className="row" style={{ gap: 4 }}>
            {PERIODS.map((item) => (
              <button
                key={item.value}
                className={`btn sm ${period === item.value ? 'btn-gold' : ''}`}
                onClick={() => setPeriod(item.value)}
              >
                {item.label}
              </button>
            ))}
          </div>
          <div className="field" style={{ minWidth: 170 }}>
            <label htmlFor="report-date">Fecha de referencia</label>
            <input id="report-date" className="input" type="date" value={date} onChange={(event) => setDate(event.target.value)} />
          </div>
          <div className="row" style={{ gap: 8, marginLeft: 'auto' }}>
            <button className="btn" onClick={exportPdf} disabled={busy !== null}><FileText size={15} /> {busy === 'pdf' ? 'Generando…' : 'PDF'}</button>
            <button className="btn btn-gold" onClick={exportExcel} disabled={busy !== null}><FileSpreadsheet size={15} /> {busy === 'excel' ? 'Generando…' : 'Excel'}</button>
          </div>
        </div>
        <p className="small muted" style={{ margin: '12px 0 0' }}>
          Período analizado: <strong>{report.rangeLabel}</strong>. El Excel incluye hojas de Resumen, Productos y Análisis.
        </p>
      </section>

      <div className="grid stat-grid">
        <Stat label="Ventas totales" value={money(report.total, tenant.currency)} icon={<Wallet size={19} />} />
        <Stat label="Facturas cobradas" value={String(report.invoiceCount)} icon={<FileText size={19} />} />
        <Stat label="Unidades vendidas" value={String(report.unitsSold)} icon={<BarChart3 size={19} />} />
        <Stat label="Ticket promedio" value={money(report.averageTicket, tenant.currency)} icon={<Download size={19} />} />
      </div>

      {report.invoiceCount === 0 ? (
        <EmptyState
          icon={<BarChart3 size={36} />}
          title="Sin ventas en este período"
          text="Cambia la fecha de referencia o cobra una venta para ver el reporte."
        />
      ) : (
        <div className="grid two-col">
          <section className="card">
            <div className="card-title"><h2>Productos más vendidos</h2><span className="badge">{report.products.length}</span></div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr><th>Producto</th><th className="num">Und.</th><th className="num">Ingreso</th><th className="num">Ganancia</th></tr>
                </thead>
                <tbody>
                  {report.products.slice(0, 12).map((product) => (
                    <tr key={product.id}>
                      <td>{product.name}</td>
                      <td className="num">{product.qty}</td>
                      <td className="num strong">{money(product.revenue, tenant.currency)}</td>
                      <td className="num" style={{ color: product.profit < 0 ? '#a34034' : '#3c7a50' }}>{money(product.profit, tenant.currency)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          <div className="stack">
            <section className="card">
              <div className="card-title"><h2>Por método de pago</h2></div>
              <div className="stack" style={{ gap: 9 }}>
                {report.payments.map((payment) => (
                  <div key={payment.method} className="row spread small">
                    <span><span className="badge">{payment.method}</span> <span className="muted">×{payment.count}</span></span>
                    <strong>{money(payment.total, tenant.currency)}</strong>
                  </div>
                ))}
              </div>
            </section>
            <section className="card">
              <div className="card-title"><h2>Interpretación rápida</h2></div>
              <p className="small muted" style={{ margin: 0, lineHeight: 1.6 }}>
                La <b>inversión en inventario</b> es lo que tienes hoy en stock a costo. La <b>ganancia bruta</b> es lo vendido menos su costo.
                Las <b>pérdidas</b> son las unidades dadas de baja por daño, vencimiento, robo u otro motivo.
              </p>
            </section>
          </div>
        </div>
      )}

      <section className="card pad-lg">
        <div className="card-title">
          <h2><Wallet size={17} style={{ verticalAlign: -3, marginRight: 6 }} /> Inversión, ganancias y pérdidas</h2>
          <span className="badge">Período: {report.rangeLabel}</span>
        </div>
        <div className="grid stat-grid">
          <Stat label="Inversión en inventario" value={money(report.inventoryValue, tenant.currency)} icon={<Wallet size={19} />} />
          <Stat label="Costo de lo vendido" value={money(report.cogs, tenant.currency)} icon={<BarChart3 size={19} />} />
          <Stat
            label="Ganancia bruta"
            value={money(report.grossProfit, tenant.currency)}
            icon={<TrendingUp size={19} />}
            tone={report.grossProfit < 0 ? 'bad' : 'good'}
          />
          <Stat label={`Pérdidas por mermas (${report.lossQty} und.)`} value={money(report.lossCost, tenant.currency)} icon={<TrendingDown size={19} />} tone="bad" />
        </div>
        <div className="divider" />
        <div className="row spread">
          <strong>Resultado neto del período</strong>
          <strong style={{ fontSize: 20, color: report.netProfit < 0 ? '#a34034' : '#9a7524' }}>{money(report.netProfit, tenant.currency)}</strong>
        </div>
        <p className="file-hint" style={{ margin: '8px 0 0' }}>
          Resultado neto = ventas − costo de lo vendido − valor de las mermas. Para mejorar la precisión, registra el costo unitario de cada producto.
        </p>
      </section>

      <div className="grid two-col">
        <section className="card">
          <div className="card-title"><h2>Registrar pérdida / merma</h2><span className="badge">Descuenta stock</span></div>
          <form className="stack" onSubmit={submitLoss}>
            <div className="field">
              <label htmlFor="loss-product">Producto</label>
              <select id="loss-product" className="input" value={productId} onChange={(event) => setProductId(event.target.value)} required>
                <option value="">Selecciona un producto…</option>
                {products.map((product) => (
                  <option key={product.id} value={product.id}>{product.name} · {product.stock} und.</option>
                ))}
              </select>
            </div>
            <div className="grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
              <div className="field">
                <label htmlFor="loss-qty">Unidades perdidas</label>
                <input id="loss-qty" className="input" type="number" min="1" step="1" value={qty} onChange={(event) => setQty(event.target.value)} required />
              </div>
              <div className="field">
                <label htmlFor="loss-reason">Motivo</label>
                <select id="loss-reason" className="input" value={reason} onChange={(event) => setReason(event.target.value as LossReason)}>
                  {REASONS.map((item) => <option key={item} value={item}>{item}</option>)}
                </select>
              </div>
            </div>
            <div className="field">
              <label htmlFor="loss-note">Nota (opcional)</label>
              <input id="loss-note" className="input" value={note} onChange={(event) => setNote(event.target.value)} placeholder="Ej. Lote vencido el 18/11" />
            </div>
            <button className="btn btn-gold" type="submit" disabled={products.length === 0}><TrendingDown size={15} /> Registrar pérdida</button>
            {products.length === 0 && <span className="file-hint">Agrega productos antes de registrar mermas.</span>}
          </form>
        </section>

        <section className="card">
          <div className="card-title"><h2>Mermas del período</h2><span className="badge">{report.losses.length}</span></div>
          {report.losses.length === 0 ? (
            <EmptyState icon={<TrendingDown size={30} />} title="Sin mermas" text="No hay pérdidas registradas en este período." />
          ) : (
            <div className="table-wrap">
              <table>
                <thead><tr><th>Producto</th><th>Motivo</th><th className="num">Und.</th><th className="num">Valor</th></tr></thead>
                <tbody>
                  {report.losses.slice(0, 12).map((loss) => (
                    <tr key={loss.id}>
                      <td><div className="small strong">{loss.productName}</div><div className="tiny muted">{dateLabel(loss.createdAt)}</div></td>
                      <td><span className="badge warn">{loss.reason}</span></td>
                      <td className="num">{loss.qty}</td>
                      <td className="num strong">{money(loss.qty * loss.cost, tenant.currency)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
