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

export type View = 'ventas' | 'productos' | 'escanear' | 'facturas' | 'configuracion'

export type Session = { kind: 'owner' } | { kind: 'cashier'; id: string; name: string }
