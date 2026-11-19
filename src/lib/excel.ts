import writeExcelFile, { type Cell, type SheetData } from 'write-excel-file/browser'
import type { Tenant } from '../types'
import { dateLabel } from './format'
import type { ReportData } from './report'

const MONEY_FORMAT = '#,##0.00'
const HEADER_STYLE = { fontWeight: 'bold' as const, backgroundColor: '#F5E9C9' }

const text = (value: string): Cell => ({ value, type: String })
const bold = (value: string): Cell => ({ value, type: String, ...HEADER_STYLE })
const number = (value: number): Cell => ({ value: Math.round(value * 100) / 100, type: Number })
const amount = (value: number): Cell => ({ ...number(value), format: MONEY_FORMAT })

function resumenSheet(tenant: Tenant, report: ReportData): SheetData {
  const currency = report.currency || tenant.currency
  return [
    [{ value: tenant.name, type: String, fontWeight: 'bold', fontSize: 14 }],
    [{ value: report.title, type: String, fontWeight: 'bold', fontSize: 12 }],
    [text('Período'), text(report.rangeLabel)],
    [text('Generado'), text(dateLabel(report.generatedAt))],
    [text('Moneda'), text(currency)],
    [],
    [bold('Indicador'), bold('Valor')],
    [text('Ventas totales'), amount(report.total)],
    [text('Subtotal'), amount(report.subtotal)],
    [text('Impuesto'), amount(report.tax)],
    [text('Facturas'), number(report.invoiceCount)],
    [text('Unidades vendidas'), number(report.unitsSold)],
    [text('Ticket promedio'), amount(report.averageTicket)],
    [],
    [bold('Método de pago'), bold('Facturas'), bold('Total')],
    ...report.payments.map(
      (payment): SheetData[number] => [text(payment.method), number(payment.count), amount(payment.total)],
    ),
  ]
}

function productosSheet(report: ReportData): SheetData {
  return [
    [bold('Producto'), bold('Unidades'), bold('Ingreso'), bold('Costo'), bold('Ganancia')],
    ...report.products.map(
      (product): SheetData[number] => [
        text(product.name),
        number(product.qty),
        amount(product.revenue),
        amount(product.cost),
        amount(product.profit),
      ],
    ),
    ...(report.products.length === 0 ? [[text('Sin ventas en el período')] as SheetData[number]] : []),
  ]
}

function analisisSheet(tenant: Tenant, report: ReportData): SheetData {
  const currency = report.currency || tenant.currency
  return [
    [{ value: 'Análisis de inversión, ganancias y pérdidas', type: String, fontWeight: 'bold', fontSize: 13 }],
    [text('Período'), text(report.rangeLabel)],
    [],
    [bold('Concepto'), bold(`Valor (${currency})`)],
    [text('Inversión en inventario (costo × stock actual)'), amount(report.inventoryValue)],
    [text('Costo de lo vendido'), amount(report.cogs)],
    [text('Ganancia bruta (ventas − costo de lo vendido)'), amount(report.grossProfit)],
    [text(`Pérdidas por mermas (${report.lossQty} unidades)`), amount(report.lossCost)],
    [text('Resultado neto (ganancia bruta − mermas)'), amount(report.netProfit)],
    [],
    [bold('Mermas del período')],
    [bold('Fecha'), bold('Producto'), bold('Unidades'), bold('Costo unitario'), bold('Valor perdido'), bold('Motivo'), bold('Nota')],
    ...report.losses.map(
      (loss): SheetData[number] => [
        text(dateLabel(loss.createdAt)),
        text(loss.productName),
        number(loss.qty),
        amount(loss.cost),
        amount(loss.qty * loss.cost),
        text(loss.reason),
        text(loss.note ?? ''),
      ],
    ),
    ...(report.losses.length === 0 ? [[text('Sin mermas registradas en el período')] as SheetData[number]] : []),
  ]
}

export async function downloadReportExcel(tenant: Tenant, report: ReportData) {
  const fileKey = new Date(report.start).toISOString().slice(0, 10)
  await writeExcelFile(
    [
      { data: resumenSheet(tenant, report), sheet: 'Resumen', columns: [{ width: 34 }, { width: 30 }, { width: 20 }] },
      {
        data: productosSheet(report),
        sheet: 'Productos',
        columns: [{ width: 40 }, { width: 14 }, { width: 20 }, { width: 20 }, { width: 20 }],
      },
      {
        data: analisisSheet(tenant, report),
        sheet: 'Análisis',
        columns: [
          { width: 46 },
          { width: 24 },
          { width: 20 },
          { width: 20 },
          { width: 20 },
          { width: 18 },
          { width: 30 },
        ],
      },
    ],
    { fontFamily: 'Arial' },
  ).toFile(`reporte-${report.period}-${fileKey}.xlsx`)
}
