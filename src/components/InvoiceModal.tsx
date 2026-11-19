import { Bluetooth, CheckCircle2, FileDown, FileText } from 'lucide-react'
import type { Invoice, Tenant } from '../types'
import { dateLabel, money } from '../lib/format'
import { Modal } from './Ui'

export default function InvoiceModal({
  invoice,
  tenant,
  printing,
  onClose,
  onPdf,
  onTicket,
  onBluetooth,
}: {
  invoice: Invoice
  tenant: Tenant
  printing: boolean
  onClose: () => void
  onPdf: () => void
  onTicket: () => void
  onBluetooth: () => void
}) {
  return (
    <Modal
      title="¡Venta completada!"
      subtitle={`Factura #${String(invoice.number).padStart(6, '0')} guardada`}
      onClose={onClose}
      wide
      footer={
        <>
          <button className="btn" onClick={onClose}><CheckCircle2 size={15} /> Nueva venta</button>
          <button className="btn" onClick={onPdf}><FileDown size={15} /> PDF A4</button>
          <button className="btn" onClick={onTicket}><FileText size={15} /> Ticket 80 mm</button>
          <button className="btn btn-gold" onClick={onBluetooth} disabled={printing}>
            <Bluetooth size={15} /> {printing ? 'Imprimiendo…' : 'Imprimir Bluetooth'}
          </button>
        </>
      }
    >
      <div className="invoice-paper">
        <h3>{tenant.name}</h3>
        <div className="small muted" style={{ textAlign: 'center', marginBottom: 14 }}>
          {tenant.ruc && <>RUC/NIF {tenant.ruc} · </>}{dateLabel(invoice.createdAt)}
        </div>
        <div className="paper-row"><span>FACTURA</span><strong>#{String(invoice.number).padStart(6, '0')}</strong></div>
        {invoice.customer && <div className="paper-row"><span>Cliente</span><span>{invoice.customer}</span></div>}
        {invoice.cashierName && <div className="paper-row"><span>Atendido por</span><span>{invoice.cashierName}</span></div>}
        <hr style={{ border: 0, borderTop: '1px dashed #c9bea5', margin: '12px 0' }} />
        {invoice.lines.map((line) => (
          <div key={line.productId} style={{ marginBottom: 10 }}>
            <div className="paper-row"><strong>{line.qty} × {line.name}</strong><span>{money(line.price * line.qty, tenant.currency)}</span></div>
            <div className="paper-row tiny muted"><span>{money(line.price, tenant.currency)} c/u</span></div>
          </div>
        ))}
        <hr style={{ border: 0, borderTop: '1px dashed #c9bea5', margin: '12px 0' }} />
        <div className="paper-row"><span>Subtotal</span><span>{money(invoice.subtotal, tenant.currency)}</span></div>
        <div className="paper-row"><span>Impuesto</span><span>{money(invoice.tax, tenant.currency)}</span></div>
        <div className="paper-row strong" style={{ fontSize: 15, marginTop: 8 }}><span>TOTAL</span><span>{money(invoice.total, tenant.currency)}</span></div>
        <div className="paper-row tiny muted" style={{ marginTop: 8 }}><span>Pago: {invoice.payment}</span></div>
        <p style={{ textAlign: 'center', marginTop: 18 }}>¡Gracias por su compra!</p>
      </div>
    </Modal>
  )
}
