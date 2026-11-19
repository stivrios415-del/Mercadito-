import { useState } from 'react'
import { Package, Pencil, Plus, ScanLine, Search, Trash2 } from 'lucide-react'
import type { Product } from '../types'
import { money } from '../lib/format'
import { EmptyState } from './Ui'

export default function ProductsView({
  products,
  currency,
  onNew,
  onScan,
  onEdit,
  onDelete,
  onAdjustStock,
}: {
  products: Product[]
  currency: string
  onNew: () => void
  onScan: () => void
  onEdit: (product: Product) => void
  onDelete: (product: Product) => void
  onAdjustStock: (product: Product, delta: number) => void
}) {
  const [query, setQuery] = useState('')
  const [lowOnly, setLowOnly] = useState(false)
  const filtered = products.filter((product) => {
    const matches = `${product.name} ${product.barcode}`.toLowerCase().includes(query.toLowerCase())
    return matches && (!lowOnly || product.stock <= 5)
  })

  return (
    <div className="stack" style={{ gap: 16 }}>
      <div className="row spread wrap">
        <div className="row" style={{ gap: 8 }}>
          <button className="btn btn-gold" onClick={onNew}><Plus size={16} /> Nuevo producto</button>
          <button className="btn" onClick={onScan}><ScanLine size={16} /> Escanear y registrar</button>
        </div>
        <button className={`btn ${lowOnly ? 'btn-gold' : ''}`} onClick={() => setLowOnly((value) => !value)}>
          {lowOnly ? '✓ ' : ''}Stock bajo (≤ 5)
        </button>
      </div>

      <section className="card">
        <div className="search-bar" style={{ marginBottom: 14 }}>
          <div className="input-with-icon" style={{ flex: 1 }}>
            <Search size={17} />
            <input className="input" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar por nombre o código de barras" />
          </div>
          <span className="muted small">{filtered.length} producto{filtered.length === 1 ? '' : 's'}</span>
        </div>

        {filtered.length === 0 ? (
          <EmptyState
            icon={<Package size={38} />}
            title={products.length ? 'Sin resultados' : 'Aún no hay productos'}
            text={products.length ? 'Prueba con otra búsqueda.' : 'Escanea el código de barras de tu primer producto y toma su foto.'}
            action={!products.length ? <button className="btn btn-gold" onClick={onScan}><ScanLine size={16} /> Escanear producto</button> : undefined}
          />
        ) : (
          <div className="product-grid">
            {filtered.map((product) => (
              <div key={product.id} className="product-card">
                <div className="product-thumb">
                  {product.image ? <img src={product.image} alt={product.name} /> : <Package size={34} />}
                </div>
                <div>
                  <div className="product-name">{product.name}</div>
                  <div className="product-barcode">{product.barcode || 'Sin código'}</div>
                </div>
                <div className="product-meta">
                  <span className="product-price">{money(product.price, currency)}</span>
                  <span className={`badge ${product.stock <= 0 ? 'bad' : product.stock <= 5 ? 'warn' : 'ok'}`}>
                    {product.stock <= 0 ? 'Agotado' : `${product.stock} und.`}
                  </span>
                </div>
                <div className="row spread" style={{ marginTop: 'auto' }}>
                  <div className="qty-controls">
                    <button onClick={() => onAdjustStock(product, -1)} aria-label="Quitar 1 de stock">−</button>
                    <span>{product.stock}</span>
                    <button onClick={() => onAdjustStock(product, 1)} aria-label="Agregar 1 de stock">+</button>
                  </div>
                  <div className="row" style={{ gap: 4 }}>
                    <button className="icon-btn sm" title="Editar" onClick={() => onEdit(product)}><Pencil size={14} /></button>
                    <button className="icon-btn sm btn-danger" title="Eliminar" onClick={() => onDelete(product)}><Trash2 size={14} /></button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
