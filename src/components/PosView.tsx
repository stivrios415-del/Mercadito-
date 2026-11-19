import { useState } from 'react'
import { CreditCard, Package, ScanLine, Search, ShoppingCart, Trash2 } from 'lucide-react'
import type { CartLine, PaymentMethod, Product } from '../types'
import { money } from '../lib/format'
import { EmptyState } from './Ui'

export default function PosView({
  products,
  cart,
  currency,
  taxRate,
  onAdd,
  onQty,
  onClear,
  onCheckout,
  onScan,
}: {
  products: Product[]
  cart: CartLine[]
  currency: string
  taxRate: number
  onAdd: (product: Product) => void
  onQty: (productId: string, delta: number) => void
  onClear: () => void
  onCheckout: (payment: PaymentMethod, customer: string) => void
  onScan: () => void
}) {
  const [query, setQuery] = useState('')
  const [payment, setPayment] = useState<PaymentMethod>('Efectivo')
  const [customer, setCustomer] = useState('')
  const productById = new Map(products.map((product) => [product.id, product]))
  const filtered = products.filter((product) => `${product.name} ${product.barcode}`.toLowerCase().includes(query.toLowerCase()))
  const subtotal = cart.reduce((sum, line) => sum + line.price * line.qty, 0)
  const tax = subtotal * taxRate
  const total = subtotal + tax
  const blocked = cart.some((line) => (productById.get(line.productId)?.stock ?? 0) < line.qty)

  return (
    <div className="grid two-col">
      <section className="card">
        <div className="search-bar">
          <div className="input-with-icon" style={{ flex: 1 }}>
            <Search size={17} />
            <input className="input" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar producto o escanear código" />
          </div>
          <button className="btn" onClick={onScan}><ScanLine size={16} /> <span className="hide-sm">Escanear</span></button>
        </div>

        {filtered.length === 0 ? (
          <EmptyState icon={<Package size={36} />} title="No hay productos" text="Agrega productos desde el escáner o desde la sección Productos." />
        ) : (
          <div className="product-grid">
            {filtered.map((product) => (
              <button key={product.id} className="product-card" onClick={() => onAdd(product)} disabled={product.stock <= 0} style={{ opacity: product.stock <= 0 ? 0.55 : 1 }}>
                <div className="product-thumb">
                  {product.image ? <img src={product.image} alt={product.name} /> : <Package size={32} />}
                </div>
                <div className="product-name">{product.name}</div>
                <div className="product-meta">
                  <span className="product-price">{money(product.price, currency)}</span>
                  <span className={`badge ${product.stock <= 5 ? 'warn' : 'ok'}`}>{product.stock} und.</span>
                </div>
              </button>
            ))}
          </div>
        )}
      </section>

      <aside className="card cart-panel">
        <div className="card-title">
          <h2><ShoppingCart size={17} style={{ verticalAlign: -3, marginRight: 6 }} /> Carrito</h2>
          {cart.length > 0 && <button className="btn btn-ghost sm" onClick={onClear}>Vaciar</button>}
        </div>

        {cart.length === 0 ? (
          <EmptyState title="Carrito vacío" text="Toca un producto para agregarlo a la venta." />
        ) : (
          <div>
            {cart.map((line) => (
              <div key={line.productId} className="cart-line">
                {line.image ? <img src={line.image} alt="" /> : <div style={{ width: 42, height: 42, borderRadius: 10, background: 'var(--gold-light)' }} />}
                <div className="cart-line-info">
                  <strong>{line.name}</strong>
                  <small>{money(line.price, currency)} c/u</small>
                </div>
                <div className="qty-controls">
                  <button onClick={() => onQty(line.productId, -1)} aria-label="Quitar uno">−</button>
                  <span>{line.qty}</span>
                  <button onClick={() => onQty(line.productId, 1)} aria-label="Agregar uno">+</button>
                </div>
                <button className="icon-btn sm btn-danger" onClick={() => onQty(line.productId, -line.qty)} aria-label="Eliminar línea"><Trash2 size={13} /></button>
              </div>
            ))}
          </div>
        )}

        <div className="totals">
          <div className="total-row"><span className="muted">Subtotal</span><strong>{money(subtotal, currency)}</strong></div>
          <div className="total-row"><span className="muted">Impuesto ({(taxRate * 100).toFixed(0)}%)</span><strong>{money(tax, currency)}</strong></div>
          <div className="total-row grand"><span>Total</span><span>{money(total, currency)}</span></div>
        </div>

        <div className="field">
          <label htmlFor="payment">Método de pago</label>
          <select id="payment" className="input" value={payment} onChange={(e) => setPayment(e.target.value as PaymentMethod)}>
            <option>Efectivo</option>
            <option>Tarjeta</option>
            <option>Transferencia</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="customer">Cliente (opcional)</label>
          <input id="customer" className="input" value={customer} onChange={(e) => setCustomer(e.target.value)} placeholder="Nombre del cliente" />
        </div>
        {blocked && <p className="small" style={{ color: '#a34034', margin: 0 }}>Hay productos sin stock suficiente para esta venta.</p>}
        <button
          className="btn btn-gold btn-lg btn-block"
          disabled={cart.length === 0 || blocked}
          onClick={() => onCheckout(payment, customer.trim())}
        >
          <CreditCard size={17} /> Cobrar y facturar
        </button>
      </aside>
    </div>
  )
}
