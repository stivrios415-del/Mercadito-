export type PaymentMethod = 'Efectivo' | 'Tarjeta' | 'Transferencia'

export interface Tenant {
  id: string
  slug: string
  name: string
  logo?: string
  ruc?: string
  phone?: string
  address?: string
  currency: string
  taxRate: number
  requireLogin?: boolean
  /** Fecha (ms) hasta la cual el negocio tiene acceso a vender. null = sin vencimiento. */
  paidUntil?: number | null
  /** Bloqueo manual del administrador del software. */
  blocked?: boolean
  createdAt: number
}

export interface Cashier {
  id: string
  tenantId: string
  name: string
  email: string
  salt?: string
  passwordHash?: string
  active: boolean
  createdAt: number
}

export interface Product {
  id: string
  tenantId: string
  barcode: string
  name: string
  price: number
  /** Costo unitario de compra. Base para inversión, ganancia y pérdidas. */
  cost: number
  stock: number
  image?: string
  createdAt: number
  updatedAt: number
}

export interface CartLine {
  productId: string
  barcode: string
  name: string
  price: number
  /** Costo unitario congelado al momento de la venta. */
  cost?: number
  qty: number
  image?: string
}

export interface Invoice {
  id: string
  tenantId: string
  number: number
  lines: CartLine[]
  subtotal: number
  tax: number
  total: number
  payment: PaymentMethod
  customer?: string
  cashierName?: string
  createdAt: number
}

export type LossReason = 'Daño' | 'Vencimiento' | 'Robo' | 'Otro'

/** Merma: unidades dadas de baja por daño, vencimiento, robo u otro motivo. */
export interface StockLoss {
  id: string
  tenantId: string
  productId: string
  productName: string
  qty: number
  /** Costo unitario congelado al momento de la merma. */
  cost: number
  reason: LossReason
  note?: string
  createdAt: number
}

export type Period = 'diario' | 'semanal' | 'mensual'

export type View = 'ventas' | 'productos' | 'escanear' | 'facturas' | 'reportes' | 'configuracion' | 'admin'

export type Session = { kind: 'owner' } | { kind: 'cashier'; id: string; name: string }
