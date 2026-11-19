import type { Invoice, PaymentMethod, Period, Product, StockLoss } from '../types'

export type ReportProductRow = {
  id: string
  name: string
  qty: number
  revenue: number
  cost: number
  profit: number
}

export type ReportPaymentRow = { method: PaymentMethod; count: number; total: number }

export type ReportData = {
  period: Period
  title: string
  rangeLabel: string
  generatedAt: number
  currency: string
  start: number
  end: number
  invoiceCount: number
  unitsSold: number
  total: number
  subtotal: number
  tax: number
  averageTicket: number
  payments: ReportPaymentRow[]
  products: ReportProductRow[]
  cogs: number
  grossProfit: number
  inventoryValue: number
  lossQty: number
  lossCost: number
  netProfit: number
  losses: StockLoss[]
}

export const PAYMENT_METHODS: PaymentMethod[] = ['Efectivo', 'Tarjeta', 'Transferencia']

const PERIOD_TITLE: Record<Period, string> = {
  diario: 'Reporte diario de ventas',
  semanal: 'Reporte semanal de ventas',
  mensual: 'Reporte mensual de ventas',
}

const shortDate = (value: number) =>
  new Intl.DateTimeFormat('es-419', { day: '2-digit', month: 'short', year: 'numeric' }).format(value)

function parseDate(value: string, fallback: Date) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return new Date(fallback.getFullYear(), fallback.getMonth(), fallback.getDate())
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  if (!year || month < 1 || month > 12 || day < 1 || day > 31) {
    return new Date(fallback.getFullYear(), fallback.getMonth(), fallback.getDate())
  }
  return new Date(year, month - 1, day)
}

/** Inicio y fin (exclusivo) del período elegido, en hora local. */
export function periodRange(period: Period, date: string, today = new Date()) {
  const base = parseDate(date, today)
  const year = base.getFullYear()
  const month = base.getMonth()
  const day = base.getDate()

  if (period === 'semanal') {
    // La semana empieza en lunes, como en es-419.
    const weekday = (base.getDay() + 6) % 7
    const start = new Date(year, month, day - weekday)
    const end = new Date(start)
    end.setDate(end.getDate() + 7)
    return { start, end }
  }
  if (period === 'mensual') {
    return { start: new Date(year, month, 1), end: new Date(year, month + 1, 1) }
  }
  return { start: new Date(year, month, day), end: new Date(year, month, day + 1) }
}

export function defaultDateInput(date = new Date()) {
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

export function buildReport({
  period,
  date,
  invoices,
  products,
  losses,
  currency,
  now = Date.now(),
}: {
  period: Period
  date: string
  invoices: Invoice[]
  products: Product[]
  losses: StockLoss[]
  currency: string
  now?: number
}): ReportData {
  const { start, end } = periodRange(period, date, new Date(now))
  const startMs = start.getTime()
  const endMs = end.getTime()

  const productById = new Map(products.map((product) => [product.id, product]))
  const inPeriod = invoices.filter((invoice) => invoice.createdAt >= startMs && invoice.createdAt < endMs)

  const rows = new Map<string, ReportProductRow>()
  let unitsSold = 0
  let subtotal = 0
  let tax = 0
  let total = 0
  let cogs = 0

  for (const invoice of inPeriod) {
    subtotal += invoice.subtotal
    tax += invoice.tax
    total += invoice.total
    for (const line of invoice.lines) {
      const qty = line.qty
      const revenue = line.price * qty
      const unitCost = line.cost ?? productById.get(line.productId)?.cost ?? 0
      const cost = unitCost * qty
      unitsSold += qty
      cogs += cost

      const key = line.productId || line.barcode || line.name
      const row = rows.get(key) ?? { id: key, name: line.name, qty: 0, revenue: 0, cost: 0, profit: 0 }
      row.qty += qty
      row.revenue += revenue
      row.cost += cost
      row.profit += revenue - cost
      rows.set(key, row)
    }
  }

  const payments = PAYMENT_METHODS.map((method) => {
    const matches = inPeriod.filter((invoice) => invoice.payment === method)
    return {
      method,
      count: matches.length,
      total: matches.reduce((sum, invoice) => sum + invoice.total, 0),
    }
  })

  const periodLosses = losses.filter((loss) => loss.createdAt >= startMs && loss.createdAt < endMs)
  const lossCost = periodLosses.reduce((sum, loss) => sum + loss.qty * loss.cost, 0)
  const lossQty = periodLosses.reduce((sum, loss) => sum + loss.qty, 0)
  const grossProfit = total - cogs
  const inventoryValue = products.reduce((sum, product) => sum + product.cost * product.stock, 0)

  return {
    period,
    title: PERIOD_TITLE[period],
    rangeLabel:
      period === 'diario'
        ? shortDate(start.getTime())
        : `${shortDate(start.getTime())} al ${shortDate(end.getTime() - 1)}`,
    generatedAt: now,
    currency,
    start: startMs,
    end: endMs,
    invoiceCount: inPeriod.length,
    unitsSold,
    total,
    subtotal,
    tax,
    averageTicket: inPeriod.length ? total / inPeriod.length : 0,
    payments,
    products: [...rows.values()].sort((a, b) => b.revenue - a.revenue || b.qty - a.qty),
    cogs,
    grossProfit,
    inventoryValue,
    lossQty,
    lossCost,
    netProfit: grossProfit - lossCost,
    losses: periodLosses.sort((a, b) => b.createdAt - a.createdAt),
  }
}
