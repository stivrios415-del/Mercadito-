import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import type { Cashier, Invoice, Product, Tenant } from '../types'

interface POSDB extends DBSchema {
  tenants: {
    key: string
    value: Tenant
    indexes: { 'by-slug': string }
  }
  products: {
    key: string
    value: Product
    indexes: {
      'by-tenant': string
      'by-barcode': [string, string]
    }
  }
  invoices: {
    key: string
    value: Invoice
    indexes: { 'by-tenant': string }
  }
  cashiers: {
    key: string
    value: Cashier
    indexes: {
      'by-tenant': string
      'by-email': [string, string]
    }
  }
}

let dbPromise: Promise<IDBPDatabase<POSDB>> | undefined

function db() {
  if (!dbPromise) {
    dbPromise = openDB<POSDB>('aurora-pos', 2, {
      upgrade(database) {
        if (!database.objectStoreNames.contains('tenants')) {
          const tenants = database.createObjectStore('tenants', { keyPath: 'id' })
          tenants.createIndex('by-slug', 'slug', { unique: true })
        }
        if (!database.objectStoreNames.contains('products')) {
          const products = database.createObjectStore('products', { keyPath: 'id' })
          products.createIndex('by-tenant', 'tenantId')
          products.createIndex('by-barcode', ['tenantId', 'barcode'], { unique: true })
        }
        if (!database.objectStoreNames.contains('invoices')) {
          const invoices = database.createObjectStore('invoices', { keyPath: 'id' })
          invoices.createIndex('by-tenant', 'tenantId')
        }
        if (!database.objectStoreNames.contains('cashiers')) {
          const cashiers = database.createObjectStore('cashiers', { keyPath: 'id' })
          cashiers.createIndex('by-tenant', 'tenantId')
          cashiers.createIndex('by-email', ['tenantId', 'email'], { unique: true })
        }
      },
    })
  }
  return dbPromise
}

export const newId = () =>
  globalThis.crypto?.randomUUID?.() ?? `id-${Date.now()}-${Math.random().toString(36).slice(2)}`

export function slugify(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
}

export async function listTenants(): Promise<Tenant[]> {
  const all = await (await db()).getAll('tenants')
  return all.sort((a, b) => a.name.localeCompare(b.name))
}

export const getTenant = (id: string) => db().then((d) => d.get('tenants', id))
export const getTenantBySlug = (slug: string) => db().then((d) => d.getFromIndex('tenants', 'by-slug', slug))
export const putTenant = (tenant: Tenant) => db().then((d) => d.put('tenants', tenant))

export async function deleteTenant(id: string) {
  const d = await db()
  const tx = d.transaction(['tenants', 'products', 'invoices', 'cashiers'], 'readwrite')
  await tx.objectStore('tenants').delete(id)
  for (const product of await tx.objectStore('products').index('by-tenant').getAll(id)) {
    await tx.objectStore('products').delete(product.id)
  }
  for (const invoice of await tx.objectStore('invoices').index('by-tenant').getAll(id)) {
    await tx.objectStore('invoices').delete(invoice.id)
  }
  for (const cashier of await tx.objectStore('cashiers').index('by-tenant').getAll(id)) {
    await tx.objectStore('cashiers').delete(cashier.id)
  }
  await tx.done
}

export async function listProducts(tenantId: string): Promise<Product[]> {
  const items = await (await db()).getAllFromIndex('products', 'by-tenant', tenantId)
  return items.sort((a, b) => a.name.localeCompare(b.name))
}

export const getProductByBarcode = (tenantId: string, barcode: string) =>
  db().then((d) => d.getFromIndex('products', 'by-barcode', [tenantId, barcode]))

export const putProduct = (product: Product) => db().then((d) => d.put('products', product))

export const deleteProduct = (id: string) => db().then((d) => d.delete('products', id))

export async function listInvoices(tenantId: string): Promise<Invoice[]> {
  const items = await (await db()).getAllFromIndex('invoices', 'by-tenant', tenantId)
  return items.sort((a, b) => b.createdAt - a.createdAt)
}

export const putInvoice = (invoice: Invoice) => db().then((d) => d.put('invoices', invoice))

export async function nextInvoiceNumber(tenantId: string): Promise<number> {
  const invoices = await listInvoices(tenantId)
  return invoices.reduce((max, invoice) => Math.max(max, invoice.number), 0) + 1
}

export async function listCashiers(tenantId: string): Promise<Cashier[]> {
  const items = await (await db()).getAllFromIndex('cashiers', 'by-tenant', tenantId)
  return items.sort((a, b) => a.name.localeCompare(b.name))
}

export const getCashierByEmail = (tenantId: string, email: string) =>
  db().then((d) => d.getFromIndex('cashiers', 'by-email', [tenantId, email]))

export const putCashier = (cashier: Cashier) => db().then((d) => d.put('cashiers', cashier))

export const deleteCashier = (id: string) => db().then((d) => d.delete('cashiers', id))
