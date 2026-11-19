import { useEffect, type ReactNode } from 'react'
import { AlertCircle, CheckCircle2, X } from 'lucide-react'
import type { Tenant } from '../types'

export function Modal({
  title,
  subtitle,
  onClose,
  children,
  footer,
  wide,
}: {
  title: string
  subtitle?: string
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
  wide?: boolean
}) {
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  return (
    <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className={`modal${wide ? ' wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-head">
          <div>
            <h2>{title}</h2>
            {subtitle && <p>{subtitle}</p>}
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Cerrar">
            <X size={18} />
          </button>
        </div>
        {children}
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  )
}

export function Toast({ message, error, onClose }: { message: string; error?: boolean; onClose: () => void }) {
  useEffect(() => {
    const timer = window.setTimeout(onClose, 3800)
    return () => window.clearTimeout(timer)
  }, [message, onClose])
  return (
    <div className={`toast${error ? ' error' : ''}`} role="status">
      {error ? <AlertCircle size={18} /> : <CheckCircle2 size={18} />}
      <span>{message}</span>
    </div>
  )
}

export function EmptyState({
  title,
  text,
  action,
  icon,
}: {
  title: string
  text?: string
  action?: ReactNode
  icon?: ReactNode
}) {
  return (
    <div className="empty-state">
      {icon}
      <h3>{title}</h3>
      {text && <p className="small">{text}</p>}
      {action}
    </div>
  )
}

export function BrandLogo({ tenant, size = 34 }: { tenant: Tenant; size?: number }) {
  if (tenant.logo) {
    return <img src={tenant.logo} alt={`Logo de ${tenant.name}`} style={{ width: size, height: size }} />
  }
  return (
    <div className="brand-logo" style={{ width: size, height: size }}>
      {(tenant.name || 'N').slice(0, 1).toUpperCase()}
    </div>
  )
}
