import { lazy, Suspense, useState } from 'react'
import { Camera, ImagePlus, ScanLine, Trash2 } from 'lucide-react'
import type { Product } from '../types'
import { optimizeImage } from '../lib/image'
import { money } from '../lib/format'
import { Modal } from './Ui'

const ScannerView = lazy(() => import('./ScannerView'))

export type ProductInput = Omit<Product, 'id' | 'tenantId' | 'createdAt' | 'updatedAt'>

export default function ProductForm({
  product,
  initialBarcode = '',
  currency,
  onSave,
  onClose,
  onToast,
}: {
  product?: Product
  initialBarcode?: string
  currency: string
  onSave: (input: ProductInput) => void
  onClose: () => void
  onToast: (message: string, error?: boolean) => void
}) {
  const [barcode, setBarcode] = useState(product?.barcode ?? initialBarcode)
  const [name, setName] = useState(product?.name ?? '')
  const [price, setPrice] = useState(String(product?.price ?? ''))
  const [cost, setCost] = useState(String(product?.cost ?? ''))
  const [stock, setStock] = useState(String(product?.stock ?? '0'))
  const [image, setImage] = useState(product?.image ?? '')
  const [scanOpen, setScanOpen] = useState(false)

  const handleFile = async (file?: File, forcePng = false) => {
    if (!file) return
    try {
      const dataUrl = await optimizeImage(file, forcePng ? { maxSize: 500, quality: 0.9, forcePng } : {})
      setImage(dataUrl)
    } catch (error) {
      onToast(error instanceof Error ? error.message : 'No se pudo procesar la foto', true)
    }
  }

  const submit = (event: React.FormEvent) => {
    event.preventDefault()
    const parsedPrice = Number(price)
    const parsedCost = Number(cost)
    const parsedStock = Number(stock)
    if (!name.trim()) return onToast('Escribe el nombre del producto', true)
    if (!Number.isFinite(parsedPrice) || parsedPrice < 0) return onToast('Revisa el precio', true)
    if (cost.trim() && (!Number.isFinite(parsedCost) || parsedCost < 0)) return onToast('Revisa el costo', true)
    if (!Number.isFinite(parsedStock)) return onToast('Revisa el stock', true)
    onSave({
      barcode: barcode.trim(),
      name: name.trim(),
      price: parsedPrice,
      cost: cost.trim() ? parsedCost : 0,
      stock: parsedStock,
      image: image || undefined,
    })
  }

  return (
    <>
      <Modal
        title={product ? 'Editar producto' : 'Nuevo producto'}
        subtitle={product ? 'Actualiza datos, foto o stock.' : 'Escanea el código o escríbelo manualmente.'}
        onClose={onClose}
        footer={
          <>
            <button type="button" className="btn" onClick={onClose}>Cancelar</button>
            <button type="submit" form="product-form" className="btn btn-gold">Guardar producto</button>
          </>
        }
      >
        <form id="product-form" className="stack" onSubmit={submit}>
          <div className="row" style={{ alignItems: 'flex-start', gap: 16 }}>
            <div style={{ flex: 1 }}>
              <div className="field">
                <label htmlFor="product-barcode">Código de barras</label>
                <div className="row" style={{ gap: 6 }}>
                  <input id="product-barcode" className="input" value={barcode} onChange={(e) => setBarcode(e.target.value)} placeholder="7790000000011" inputMode="numeric" />
                  <button type="button" className="icon-btn" title="Escanear código" onClick={() => setScanOpen(true)}><ScanLine size={18} /></button>
                </div>
              </div>
            </div>
          </div>

          <div className="field">
            <label htmlFor="product-name">Nombre del producto</label>
            <input id="product-name" className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej. Leche entera 1 L" required />
          </div>

          <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))' }}>
            <div className="field">
              <label htmlFor="product-price">Precio de venta ({currency})</label>
              <input id="product-price" className="input" type="number" min="0" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} placeholder={money(0, currency)} required />
            </div>
            <div className="field">
              <label htmlFor="product-cost">Costo unitario ({currency})</label>
              <input id="product-cost" className="input" type="number" min="0" step="0.01" value={cost} onChange={(e) => setCost(e.target.value)} placeholder="0.00" />
            </div>
            <div className="field">
              <label htmlFor="product-stock">Stock</label>
              <input id="product-stock" className="input" type="number" step="1" value={stock} onChange={(e) => setStock(e.target.value)} required />
            </div>
          </div>
          <span className="file-hint" style={{ marginTop: -6 }}>El costo se usa para calcular la inversión, la ganancia y las pérdidas en Reportes.</span>

          <div className="field">
            <label>Foto del producto</label>
            {image ? (
              <div className="row" style={{ gap: 12 }}>
                <img src={image} alt="Vista previa" style={{ width: 84, height: 84, borderRadius: 14, objectFit: 'cover' }} />
                <div className="stack" style={{ gap: 6 }}>
                  <label className="btn sm" style={{ cursor: 'pointer' }}>
                    <Camera size={15} /> Tomar otra foto
                    <input type="file" accept="image/*" capture="environment" hidden onChange={(e) => handleFile(e.target.files?.[0])} />
                  </label>
                  <button type="button" className="btn sm btn-danger" onClick={() => setImage('')}><Trash2 size={14} /> Quitar</button>
                </div>
              </div>
            ) : (
              <div className="row wrap" style={{ gap: 8 }}>
                <label className="btn" style={{ cursor: 'pointer' }}>
                  <Camera size={16} /> Tomar foto
                  <input type="file" accept="image/*" capture="environment" hidden onChange={(e) => handleFile(e.target.files?.[0])} />
                </label>
                <label className="btn" style={{ cursor: 'pointer' }}>
                  <ImagePlus size={16} /> Elegir de galería
                  <input type="file" accept="image/*" hidden onChange={(e) => handleFile(e.target.files?.[0], true)} />
                </label>
              </div>
            )}
            <span className="file-hint">La foto se guarda optimizada junto al producto.</span>
          </div>
        </form>
      </Modal>

      {scanOpen && (
        <Modal title="Escanear código" subtitle="Apunta la cámara al código de barras" onClose={() => setScanOpen(false)}>
          <Suspense fallback={<p className="small muted">Cargando escáner…</p>}>
            <ScannerView
              onToast={onToast}
              onResult={(code) => {
                setBarcode(code)
                setScanOpen(false)
                onToast(`Código ${code} agregado`)
              }}
            />
          </Suspense>
        </Modal>
      )}
    </>
  )
}
