import { jsPDF } from 'jspdf'
import type { Invoice, Tenant } from '../types'
import { dateLabel, money } from './format'

function logoFormat(logo: string): 'PNG' | 'JPEG' {
  return logo.startsWith('data:image/png') ? 'PNG' : 'JPEG'
}

function drawHeader(doc: jsPDF, tenant: Tenant, width: number, compact = false) {
  let textX = 18
  if (tenant.logo) {
    const size = compact ? 16 : 22
    doc.addImage(tenant.logo, logoFormat(tenant.logo), 18, 14, size, size)
    textX = 18 + size + 5
  }
  doc.setTextColor(38, 35, 28)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(compact ? 13 : 18)
  doc.text(tenant.name || 'Mi negocio', textX, compact ? 21 : 23)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(compact ? 7 : 9)
  doc.setTextColor(110, 102, 84)
  const details = [tenant.ruc && `RUC/NIF: ${tenant.ruc}`, tenant.address, tenant.phone && `Tel: ${tenant.phone}`]
    .filter(Boolean)
    .join('   ·   ')
  if (details) doc.text(doc.splitTextToSize(details, width - textX - 18)[0] ?? '', textX, compact ? 27 : 30)
  doc.setDrawColor(200, 162, 74)
  doc.setLineWidth(0.6)
  doc.line(18, compact ? 32 : 42, width - 18, compact ? 32 : 42)
  doc.setTextColor(38, 35, 28)
}

export function buildInvoicePdf(tenant: Tenant, invoice: Invoice): jsPDF {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const width = doc.internal.pageSize.getWidth()
  drawHeader(doc, tenant, width)

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(15)
  doc.text('FACTURA', 18, 58)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.setTextColor(110, 102, 84)
  doc.text(`N.º ${String(invoice.number).padStart(6, '0')}`, width - 18, 58, { align: 'right' })
  doc.text(dateLabel(invoice.createdAt), width - 18, 64, { align: 'right' })
  if (invoice.customer) doc.text(`Cliente: ${invoice.customer}`, 18, 65)
  if (invoice.cashierName) doc.text(`Atendido por: ${invoice.cashierName}`, 18, 71)
  doc.setTextColor(38, 35, 28)

  let y = 78
  doc.setFillColor(247, 242, 230)
  doc.rect(18, y, width - 36, 9, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.text('PRODUCTO', 21, y + 6)
  doc.text('CANT.', 118, y + 6, { align: 'right' })
  doc.text('P. UNIT.', 155, y + 6, { align: 'right' })
  doc.text('IMPORTE', width - 21, y + 6, { align: 'right' })
  y += 9

  doc.setFont('helvetica', 'normal')
  for (const line of invoice.lines) {
    const name = doc.splitTextToSize(line.name, 88) as string[]
    const rowHeight = Math.max(10, name.length * 5 + 4)
    if (y + rowHeight > 245) {
      doc.addPage()
      y = 24
    }
    doc.text(name, 21, y + 6)
    doc.text(String(line.qty), 118, y + 6, { align: 'right' })
    doc.text(money(line.price, tenant.currency), 155, y + 6, { align: 'right' })
    doc.text(money(line.price * line.qty, tenant.currency), width - 21, y + 6, { align: 'right' })
    doc.setDrawColor(235, 229, 214)
    doc.line(18, y + rowHeight - 1, width - 18, y + rowHeight - 1)
    y += rowHeight
  }

  y += 8
  const boxX = 118
  doc.setFontSize(10)
  doc.text('Subtotal', boxX, y)
  doc.text(money(invoice.subtotal, tenant.currency), width - 21, y, { align: 'right' })
  y += 7
  doc.text(`Impuesto (${(tenant.taxRate * 100).toFixed(0)}%)`, boxX, y)
  doc.text(money(invoice.tax, tenant.currency), width - 21, y, { align: 'right' })
  y += 10
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(13)
  doc.setTextColor(160, 120, 38)
  doc.text('TOTAL', boxX, y)
  doc.text(money(invoice.total, tenant.currency), width - 21, y, { align: 'right' })
  doc.setTextColor(110, 102, 84)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  y += 8
  doc.text(`Pago: ${invoice.payment}`, boxX, y)

  doc.setDrawColor(200, 162, 74)
  doc.line(18, 268, width - 18, 268)
  doc.setFontSize(8)
  doc.text('¡Gracias por su compra!', width / 2, 276, { align: 'center' })
  doc.text(`${tenant.name} · ${tenant.phone || ''}`, width / 2, 281, { align: 'center' })
  return doc
}

export function downloadInvoicePdf(tenant: Tenant, invoice: Invoice) {
  buildInvoicePdf(tenant, invoice).save(`factura-${String(invoice.number).padStart(6, '0')}.pdf`)
}

export function openInvoicePdf(tenant: Tenant, invoice: Invoice) {
  const blob = buildInvoicePdf(tenant, invoice).output('blob')
  const url = URL.createObjectURL(blob)
  window.open(url, '_blank', 'noopener')
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
}

export function buildTicketPdf(tenant: Tenant, invoice: Invoice): jsPDF {
  const doc = new jsPDF({ unit: 'mm', format: [80, 200] })
  const width = 80
  drawHeader(doc, tenant, width, true)
  let y = 40
  const line = (text: string, bold = false, align: 'left' | 'right' | 'center' = 'left', size = 8) => {
    doc.setFont('helvetica', bold ? 'bold' : 'normal')
    doc.setFontSize(size)
    doc.text(text, align === 'right' ? 74 : align === 'center' ? 40 : 6, y, { align })
    y += size * 0.5 + 1.5
  }
  line(`FACTURA #${String(invoice.number).padStart(6, '0')}`, true, 'center', 10)
  line(dateLabel(invoice.createdAt), false, 'center', 7)
  if (invoice.customer) line(`Cliente: ${invoice.customer}`, false, 'left', 7)
  if (invoice.cashierName) line(`Cajero: ${invoice.cashierName}`, false, 'left', 7)
  line('-'.repeat(38), false, 'center', 7)
  for (const item of invoice.lines) {
    line(item.name.slice(0, 26), true, 'left', 7)
    line(`${item.qty} x ${money(item.price, tenant.currency)}`, false, 'left', 7)
    line(money(item.price * item.qty, tenant.currency), false, 'right', 7)
  }
  line('-'.repeat(38), false, 'center', 7)
  line(`Subtotal: ${money(invoice.subtotal, tenant.currency)}`, false, 'left', 8)
  line(`Impuesto: ${money(invoice.tax, tenant.currency)}`, false, 'left', 8)
  line(`TOTAL: ${money(invoice.total, tenant.currency)}`, true, 'left', 11)
  line(`Pago: ${invoice.payment}`, false, 'left', 7)
  line('¡Gracias por su compra!', true, 'center', 8)
  return doc
}

export function downloadTicketPdf(tenant: Tenant, invoice: Invoice) {
  buildTicketPdf(tenant, invoice).save(`ticket-${String(invoice.number).padStart(6, '0')}.pdf`)
}
