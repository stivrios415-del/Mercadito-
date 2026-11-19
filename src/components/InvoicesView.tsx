import { Bluetooth, FileDown, FileText, ReceiptText } from 'lucide-react'
import type { Invoice, Tenant } from '../types'
import { dateLabel, money } from '../lib/format'
import { EmptyState } from './Ui'

export default function InvoicesView({
  invoices,
  tenant,
  onPdf,
  onTicket,
  onBluetooth,
}: {
  invoices: Invoice[]
  tenant: Tenant
  onPdf: (invoice: Invoice) => void
  onTicket: (invoice: Invoice) => void
  onBluetooth: (invoice: Invoice) => void
}) {
  return (
    <section className="card">
      <div className="card-title">
        <h2>Historial de facturas</h2>
        <span className="badge">{invoices.length} registradas</span>
      </div>
      {invoices.length === 0 ? (
        <EmptyState icon={<ReceiptText size={36} />} title="Sin facturas todavía" text="Cuando cobres una venta, la factura aparecerá aquí para reimprimirla." />
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Factura</th>
                <th>Fecha</th>
                <th>Productos</th>
                <th>Pago</th>
                <th>Cajero</th>
                <th className="num">Total</th>
                <th className="num">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((invoice) => (
                <tr key={invoice.id}>
                  <td className="strong">#{String(invoice.number).padStart(6, '0')}</td>
                  <td className="muted small">{dateLabel(invoice.createdAt)}</td>
                  <td>{invoice.lines.reduce((sum, line) => sum + line.qty, 0)} und.</td>
                  <td><span className="badge">{invoice.payment}</span></td>
                  <td className="small">{invoice.cashierName ?? 'Dueño'}</td>
                  <td className="num strong">{money(invoice.total, tenant.currency)}</td>
                  <td className="num">
                    <div className="row" style={{ justifyContent: 'flex-end', gap: 4 }}>
                      <button className="icon-btn sm" title="Descargar PDF A4" onClick={() => onPdf(invoice)}><FileDown size={14} /></button>
                      <button className="icon-btn sm" title="Descargar ticket 80 mm" onClick={() => onTicket(invoice)}><FileText size={14} /></button>
                      <button className="icon-btn sm" title="Imprimir Bluetooth" onClick={() => onBluetooth(invoice)}><Bluetooth size={14} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
