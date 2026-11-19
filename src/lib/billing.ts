import type { Tenant } from '../types'

/** Única cuenta con acceso al panel de todos los negocios y control de cobros. */
export const SUPER_ADMIN_EMAIL = 'stivrios415@gmail.com'

export function isSuperAdminEmail(email?: string | null) {
  return Boolean(email && email.trim().toLowerCase() === SUPER_ADMIN_EMAIL)
}

export type SubscriptionStatus = 'active' | 'soon' | 'expired' | 'blocked'

const WEEK = 7 * 24 * 60 * 60 * 1000

export function subscriptionStatus(tenant: Tenant, now = Date.now()): SubscriptionStatus {
  if (tenant.blocked) return 'blocked'
  if (tenant.paidUntil != null && tenant.paidUntil < now) return 'expired'
  if (tenant.paidUntil != null && tenant.paidUntil - now < WEEK) return 'soon'
  return 'active'
}

/** Un negocio vencido o bloqueado puede consultar sus datos, pero no cobrar ventas. */
export function canSell(tenant: Tenant, now = Date.now()) {
  const status = subscriptionStatus(tenant, now)
  return status === 'active' || status === 'soon'
}

export const SUBSCRIPTION_LABEL: Record<SubscriptionStatus, string> = {
  active: 'Al corriente',
  soon: 'Por vencer',
  expired: 'Vencido',
  blocked: 'Bloqueado',
}

export function subscriptionBadge(status: SubscriptionStatus) {
  if (status === 'active') return 'ok'
  if (status === 'soon') return 'warn'
  return 'bad'
}

export function dueDateLabel(tenant: Tenant) {
  if (tenant.blocked) return 'Acceso bloqueado por el administrador'
  if (tenant.paidUntil == null) return 'Sin vencimiento definido'
  return new Intl.DateTimeFormat('es-419', { dateStyle: 'long' }).format(tenant.paidUntil)
}
