import type { CartLine, Cashier, Invoice, PaymentMethod, Product, Tenant } from '../types'
import { requireSupabase, supabase } from './supabase'

export const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined

type TenantRow = {
  id: string
  slug: string
  name: string
  logo: string | null
  ruc: string | null
  phone: string | null
  address: string | null
  currency: string
  tax_rate: number
  require_login: boolean
  created_at: string
}

type ProductRow = {
  id: string
  tenant_id: string
  barcode: string
  name: string
  price: number | string
  stock: number
  image_url: string | null
  created_at: string
  updated_at: string
}

type InvoiceRow = {
  id: string
  tenant_id: string
  number: number
  customer: string | null
  cashier_name: string | null
  payment: PaymentMethod
  lines: CartLine[]
  subtotal: number | string
  tax: number | string
  total: number | string
  created_at: string
}

type MemberRow = {
  tenant_id: string
  user_id: string
  role: 'owner' | 'cashier'
  email: string | null
  display_name: string
  active: boolean
  created_at: string
}

const num = (value: number | string | null) => Number(value ?? 0)
const time = (value: string) => new Date(value).getTime()

const toTenant = (row: TenantRow): Tenant => ({
  id: row.id,
  slug: row.slug,
  name: row.name,
  logo: row.logo ?? undefined,
  ruc: row.ruc ?? undefined,
  phone: row.phone ?? undefined,
  address: row.address ?? undefined,
  currency: row.currency,
  taxRate: num(row.tax_rate),
  requireLogin: row.require_login,
  createdAt: time(row.created_at),
})

const toProduct = (row: ProductRow): Product => ({
  id: row.id,
  tenantId: row.tenant_id,
  barcode: row.barcode,
  name: row.name,
  price: num(row.price),
  stock: row.stock,
  image: row.image_url ?? undefined,
  createdAt: time(row.created_at),
  updatedAt: time(row.updated_at),
})

const toInvoice = (row: InvoiceRow): Invoice => ({
  id: row.id,
  tenantId: row.tenant_id,
  number: row.number,
  lines: row.lines ?? [],
  subtotal: num(row.subtotal),
  tax: num(row.tax),
  total: num(row.total),
  payment: row.payment,
  customer: row.customer ?? undefined,
  cashierName: row.cashier_name ?? undefined,
  createdAt: time(row.created_at),
})

const toCashier = (row: MemberRow): Cashier => ({
  id: row.user_id,
  tenantId: row.tenant_id,
  name: row.display_name,
  email: row.email ?? '',
  salt: '',
  passwordHash: '',
  active: row.active,
  createdAt: time(row.created_at),
})

function unwrap<T>(data: T | null, error: { message: string } | null): T {
  if (error) throw new Error(error.message)
  if (data === null) throw new Error('No se recibieron datos de Supabase')
  return data
}

function dataUrlToBytes(dataUrl: string) {
  const match = /^data:([^;]+);base64,(.*)$/s.exec(dataUrl)
  if (!match) return null
  const binary = atob(match[2])
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  const contentType = match[1]
  const ext = contentType.includes('png') ? 'png' : contentType.includes('webp') ? 'webp' : 'jpg'
  return { bytes, contentType, ext }
}

/** Sube una foto (data URL) a Storage y devuelve su URL pública. */
export async function uploadImage(value: string | undefined, tenantId: string): Promise<string | undefined> {
  if (!value) return undefined
  if (!value.startsWith('data:')) return value
  const parsed = dataUrlToBytes(value)
  if (!parsed) return undefined
  const client = requireSupabase()
  const path = `${tenantId}/${crypto.randomUUID()}.${parsed.ext}`
  const { error } = await client.storage
    .from('aurora-images')
    .upload(path, parsed.bytes, { contentType: parsed.contentType, upsert: true })
  if (error) throw new Error(error.message)
  return client.storage.from('aurora-images').getPublicUrl(path).data.publicUrl
}

// -----------------------------------------------------------------------------
// Autenticación
// -----------------------------------------------------------------------------
export type AuthUser = { id: string; email: string; name: string }

export async function getAuthUser(): Promise<AuthUser | null> {
  if (!supabase) return null
  const { data } = await supabase.auth.getUser()
  if (!data.user) return null
  return {
    id: data.user.id,
    email: data.user.email ?? '',
    name: String(data.user.user_metadata?.name ?? data.user.email?.split('@')[0] ?? 'Dueño'),
  }
}

export async function signIn(email: string, password: string) {
  const client = requireSupabase()
  const { error } = await client.auth.signInWithPassword({ email: email.trim().toLowerCase(), password })
  if (error) throw new Error(error.message)
}

export async function signUpOwner(email: string, password: string, name: string) {
  const client = requireSupabase()
  const { data, error } = await client.auth.signUp({
    email: email.trim().toLowerCase(),
    password,
    options: {
      data: { name },
      // El enlace de confirmación vuelve siempre al origen desde el que se usó
      // (localhost hoy, el dominio de Vercel cuando desplieguemos).
      emailRedirectTo: window.location.origin,
    },
  })
  if (error) throw new Error(error.message)
  return data
}

export async function signOut() {
  if (supabase) await supabase.auth.signOut()
}

// -----------------------------------------------------------------------------
// Tenants y memberships
// -----------------------------------------------------------------------------
export async function fetchTenants(): Promise<Tenant[]> {
  const { data, error } = await requireSupabase().from('tenants').select('*').order('name')
  return unwrap(data, error).map((row) => toTenant(row as TenantRow))
}

export async function fetchMyMemberships(): Promise<MemberRow[]> {
  const { data, error } = await requireSupabase()
    .from('tenant_members')
    .select('*')
    .eq('active', true)
  return unwrap(data, error) as MemberRow[]
}

export type NewTenantRemote = {
  slug: string
  name: string
  ruc?: string
  phone?: string
  address?: string
  currency: string
  taxRate: number
  logo?: string
}

export async function createTenantRemote(input: NewTenantRemote, logoUrl?: string): Promise<Tenant> {
  const { data, error } = await requireSupabase()
    .from('tenants')
    .insert({
      slug: input.slug,
      name: input.name,
      ruc: input.ruc || null,
      phone: input.phone || null,
      address: input.address || null,
      currency: input.currency,
      tax_rate: input.taxRate,
      logo: logoUrl ?? null,
    })
    .select()
    .single()
  return toTenant(unwrap(data, error) as TenantRow)
}

export async function updateTenantRemote(tenant: Tenant, logoUrl?: string): Promise<Tenant> {
  const { data, error } = await requireSupabase()
    .from('tenants')
    .update({
      name: tenant.name,
      slug: tenant.slug,
      ruc: tenant.ruc || null,
      phone: tenant.phone || null,
      address: tenant.address || null,
      currency: tenant.currency,
      tax_rate: tenant.taxRate,
      require_login: tenant.requireLogin ?? false,
      ...(logoUrl !== undefined ? { logo: logoUrl } : {}),
    })
    .eq('id', tenant.id)
    .select()
    .single()
  return toTenant(unwrap(data, error) as TenantRow)
}

export async function deleteTenantRemote(id: string) {
  const { error } = await requireSupabase().from('tenants').delete().eq('id', id)
  if (error) throw new Error(error.message)
}

// -----------------------------------------------------------------------------
// Productos
// -----------------------------------------------------------------------------
export async function fetchProducts(tenantId: string): Promise<Product[]> {
  const { data, error } = await requireSupabase()
    .from('products')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('name')
  return unwrap(data, error).map((row) => toProduct(row as ProductRow))
}

export async function upsertProductRemote(product: Product, imageUrl?: string): Promise<Product> {
  const { data, error } = await requireSupabase()
    .from('products')
    .upsert({
      id: product.id,
      tenant_id: product.tenantId,
      barcode: product.barcode,
      name: product.name,
      price: product.price,
      stock: product.stock,
      image_url: imageUrl !== undefined ? imageUrl : product.image ?? null,
      created_at: new Date(product.createdAt).toISOString(),
      updated_at: new Date(product.updatedAt).toISOString(),
    })
    .select()
    .single()
  return toProduct(unwrap(data, error) as ProductRow)
}

export async function deleteProductRemote(id: string) {
  const { error } = await requireSupabase().from('products').delete().eq('id', id)
  if (error) throw new Error(error.message)
}

// -----------------------------------------------------------------------------
// Facturas
// -----------------------------------------------------------------------------
export async function fetchInvoices(tenantId: string): Promise<Invoice[]> {
  const { data, error } = await requireSupabase()
    .from('invoices')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })
  return unwrap(data, error).map((row) => toInvoice(row as InvoiceRow))
}

export async function recordSaleRemote(input: {
  tenantId: string
  lines: CartLine[]
  customer?: string
  cashierName?: string
  payment: PaymentMethod
  subtotal: number
  tax: number
  total: number
}): Promise<Invoice> {
  const { data, error } = await requireSupabase().rpc('record_sale', {
    p_tenant: input.tenantId,
    p_lines: input.lines,
    p_customer: input.customer ?? null,
    p_cashier_name: input.cashierName ?? null,
    p_payment: input.payment,
    p_subtotal: input.subtotal,
    p_tax: input.tax,
    p_total: input.total,
  })
  return toInvoice(unwrap(data, error) as InvoiceRow)
}

// -----------------------------------------------------------------------------
// Cajeros
// -----------------------------------------------------------------------------
export async function fetchCashiers(tenantId: string): Promise<Cashier[]> {
  const { data, error } = await requireSupabase()
    .from('tenant_members')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('role', 'cashier')
    .order('display_name')
  return unwrap(data, error).map((row) => toCashier(row as MemberRow))
}

export async function saveCashierRemote(input: {
  tenantId: string
  userId?: string
  name: string
  email: string
  password?: string
  active: boolean
}): Promise<Cashier> {
  const client = requireSupabase()
  const { data: sessionData } = await client.auth.getSession()
  const token = sessionData.session?.access_token
  if (!token || !supabaseUrl) throw new Error('No hay sesión activa')
  if (input.userId) return toCashier({
    tenant_id: input.tenantId,
    user_id: input.userId,
    role: 'cashier',
    email: input.email,
    display_name: input.name,
    active: input.active,
    created_at: new Date().toISOString(),
  })

  const response = await fetch(`${supabaseUrl}/functions/v1/manage-cashier`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ ...input, password: input.password }),
  })
  const body = (await response.json()) as {
    id?: string
    name?: string
    email?: string
    active?: boolean
    error?: string
  }
  if (!response.ok || !body.id) throw new Error(body.error ?? 'No se pudo guardar el cajero')
  return toCashier({
    tenant_id: input.tenantId,
    user_id: body.id,
    role: 'cashier',
    email: body.email ?? input.email,
    display_name: body.name ?? input.name,
    active: body.active ?? input.active,
    created_at: new Date().toISOString(),
  })
}

export async function deactivateCashierRemote(cashier: Cashier) {
  const { error } = await requireSupabase()
    .from('tenant_members')
    .update({ active: false })
    .eq('tenant_id', cashier.tenantId)
    .eq('user_id', cashier.id)
  if (error) throw new Error(error.message)
}
