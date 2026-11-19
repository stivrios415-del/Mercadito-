const moneyFormatters = new Map<string, Intl.NumberFormat>()

export function money(amount: number, currency = 'USD') {
  // El lempira no tiene un símbolo reconocido por Intl en todos los navegadores.
  if (currency === 'HNL') {
    return `Lps. ${new Intl.NumberFormat('es-419', { minimumFractionDigits: 2 }).format(amount)}`
  }
  if (!moneyFormatters.has(currency)) {
    moneyFormatters.set(
      currency,
      new Intl.NumberFormat('es-419', {
        style: 'currency',
        currency,
        minimumFractionDigits: 2,
      }),
    )
  }
  return moneyFormatters.get(currency)!.format(amount)
}

export function dateLabel(timestamp: number) {
  return new Intl.DateTimeFormat('es-419', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(timestamp)
}

export function todayLabel(timestamp = Date.now()) {
  return new Intl.DateTimeFormat('es-419', { dateStyle: 'long' }).format(timestamp)
}
