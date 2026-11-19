import type { Cashier } from '../types'

function toHex(bytes: Uint8Array) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

function randomSalt() {
  const bytes = new Uint8Array(16)
  if (globalThis.crypto?.getRandomValues) globalThis.crypto.getRandomValues(bytes)
  else for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256)
  return toHex(bytes)
}

async function digest(value: string): Promise<string> {
  if (globalThis.crypto?.subtle) {
    const result = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
    return toHex(new Uint8Array(result))
  }
  // Respaldo para contextos no seguros (la PWA debe usar HTTPS en producción).
  let hash = 2166136261
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

export async function hashPassword(password: string, salt = randomSalt()) {
  return { salt, passwordHash: await digest(`${salt}:${password}`) }
}

export async function verifyPassword(password: string, cashier: Cashier) {
  const { passwordHash } = await hashPassword(password, cashier.salt)
  return passwordHash === cashier.passwordHash
}
