import type { Invoice, Tenant } from '../types'
import { dateLabel } from './format'

interface BTCharacteristic {
  properties: { write?: boolean; writeWithoutResponse?: boolean }
  writeValue(value: BufferSource): Promise<void>
  writeValueWithoutResponse?(value: BufferSource): Promise<void>
}
interface BTService {
  getCharacteristics(): Promise<BTCharacteristic[]>
}
interface BTServer {
  connect(): Promise<BTServer>
  getPrimaryService(uuid: string): Promise<BTService>
  disconnect(): void
}
interface BTDevice {
  name?: string
  gatt?: BTServer
}
interface BTApi {
  requestDevice(options: { acceptAllDevices: boolean; optionalServices: string[] }): Promise<BTDevice>
}

export interface PrinterConnection {
  name: string
  write(bytes: Uint8Array): Promise<void>
  disconnect(): void
}

const SERVICE_UUIDS = [
  '000018f0-0000-1000-8000-00805f9b34fb',
  '0000ff00-0000-1000-8000-00805f9b34fb',
  '0000ffe0-0000-1000-8000-00805f9b34fb',
  '49535343-fe7d-4ae5-8fa9-9fafd205e455',
  'e7810a71-73ae-499d-8c15-faa9aef0c3f2',
]

const bluetooth = () => (navigator as Navigator & { bluetooth?: BTApi }).bluetooth

export function isBluetoothSupported() {
  return typeof window !== 'undefined' && !!bluetooth()
}

export async function connectPrinter(): Promise<PrinterConnection> {
  const api = bluetooth()
  if (!api) throw new Error('Este navegador no soporta Web Bluetooth. Prueba Chrome o Edge en Android/PC, o usa el PDF.')
  const device = await api.requestDevice({ acceptAllDevices: true, optionalServices: SERVICE_UUIDS })
  const server = await (device.gatt?.connect() ?? Promise.reject(new Error('No se pudo conectar con la impresora')))

  let characteristic: BTCharacteristic | undefined
  for (const uuid of SERVICE_UUIDS) {
    if (characteristic) break
    try {
      const service = await server.getPrimaryService(uuid)
      const characteristics = await service.getCharacteristics()
      characteristic = characteristics.find((item) => item.properties.writeWithoutResponse || item.properties.write)
    } catch {
      // Esta impresora no expone ese servicio; probamos el siguiente.
    }
  }
  if (!characteristic) {
    server.disconnect()
    throw new Error('La impresora no expone un servicio de escritura compatible')
  }

  return {
    name: device.name || 'Impresora Bluetooth',
    async write(bytes: Uint8Array) {
      for (let offset = 0; offset < bytes.length; offset += 180) {
        const chunk = bytes.slice(offset, offset + 180) as unknown as BufferSource
        try {
          if (characteristic!.writeValueWithoutResponse) {
            await characteristic!.writeValueWithoutResponse(chunk)
          } else {
            await characteristic!.writeValue(chunk)
          }
        } catch (error) {
          await characteristic!.writeValue(chunk)
          void error
        }
      }
    },
    disconnect() {
      try {
        server.disconnect()
      } catch {
        // Ya desconectada.
      }
    },
  }
}

const ESC = 0x1b
const GS = 0x1d

function latin1(text: string): number[] {
  return Array.from(text.normalize('NFC')).map((char) => {
    const code = char.codePointAt(0) ?? 63
    if (code < 256) return code
    const fallback: Record<string, number> = { '€': 0x80, '“': 0x93, '”': 0x94, '—': 0x97 }
    return fallback[char] ?? 63
  })
}

function text(value: string): number[] {
  return latin1(value)
}

function right(label: string, value: string, width = 32): number[] {
  const room = Math.max(1, width - label.length)
  return text(label + value.padStart(room, ' '))
}

function center(value: string, width = 32): number[] {
  const pad = Math.max(0, Math.floor((width - value.length) / 2))
  return text(' '.repeat(pad) + value)
}

export function buildEscPos(tenant: Tenant, invoice: Invoice): Uint8Array {
  const bytes: number[] = []
  const push = (...values: number[]) => bytes.push(...values)
  const write = (value: string) => push(...text(value))
  const line = (value: string) => {
    write(value)
    push(10)
  }

  push(ESC, 0x40) // inicializar
  push(ESC, 0x74, 0x02) // tabla de caracteres latina
  push(ESC, 0x61, 0x01) // centrar
  push(GS, 0x21, 0x11) // doble alto/ancho
  line((tenant.name || 'MI NEGOCIO').slice(0, 30))
  push(GS, 0x21, 0x00)
  if (tenant.ruc) line(`RUC/NIF: ${tenant.ruc}`)
  if (tenant.address) line(tenant.address.slice(0, 32))
  if (tenant.phone) line(`Tel: ${tenant.phone}`)
  line('-'.repeat(32))

  push(ESC, 0x61, 0x00) // izquierda
  line(`FACTURA #${String(invoice.number).padStart(6, '0')}`)
  line(dateLabel(invoice.createdAt))
  if (invoice.customer) line(`Cliente: ${invoice.customer.slice(0, 24)}`)
  if (invoice.cashierName) line(`Cajero: ${invoice.cashierName.slice(0, 24)}`)
  line('-'.repeat(32))

  for (const item of invoice.lines) {
    line(item.name.slice(0, 32))
    push(
      ...right(
        `${item.qty} x ${item.price.toFixed(2)}`,
        `${(item.qty * item.price).toFixed(2)} ${tenant.currency}`,
      ),
      10,
    )
  }
  line('-'.repeat(32))
  push(...right('Subtotal', invoice.subtotal.toFixed(2)))
  push(10)
  push(...right(`Impuesto ${(tenant.taxRate * 100).toFixed(0)}%`, invoice.tax.toFixed(2)))
  push(10)
  push(ESC, 0x45, 0x01)
  push(...right('TOTAL', `${invoice.total.toFixed(2)} ${tenant.currency}`))
  push(ESC, 0x45, 0x00)
  push(10)
  line(`Pago: ${invoice.payment}`)
  line('-'.repeat(32))
  push(ESC, 0x61, 0x01)
  push(ESC, 0x45, 0x01)
  line('GRACIAS POR SU COMPRA')
  push(ESC, 0x45, 0x00)
  push(10, 10, 10)
  push(GS, 0x56, 0x42, 0x00) // corte parcial
  return new Uint8Array(bytes)
}

export async function printInvoice(printer: PrinterConnection, tenant: Tenant, invoice: Invoice) {
  await printer.write(buildEscPos(tenant, invoice))
}
