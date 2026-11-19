import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import {
  BarChart3,
  Package,
  Plus,
  ReceiptText,
  ScanLine,
  Settings,
  ShoppingBasket,
  ShoppingCart,
  Store,
  UserRound,
  Users,
  type LucideIcon,
} from 'lucide-react'
import type { CartLine, Cashier, Invoice, PaymentMethod, Product, Session, Tenant, View } from './types'
import {
  deleteTenant as removeTenantData,
  deleteProduct as removeProductData,
  deleteCashier,
  getProductByBarcode,
  listCashiers,
  listInvoices,
  listProducts,
  listTenants,
  newId,
  nextInvoiceNumber,
  putInvoice,
  putCashier,
  putProduct,
  putTenant,
  slugify,
} from './lib/db'
import { hashPassword, verifyPassword } from './lib/auth'
import { supabaseConfigured } from './lib/supabase'
import {
  createTenantRemote,
  deactivateCashierRemote,
  deleteProductRemote,
  deleteTenantRemote,
  fetchCashiers,
  fetchInvoices,
  fetchMyMemberships,
  fetchProducts,
  fetchTenants,
  getAuthUser,
  recordSaleRemote,
  saveCashierRemote,
  signIn,
  signOut,
  updateTenantRemote,
  uploadImage,
  upsertProductRemote,
  type AuthUser,
} from './lib/remote'
import { connectPrinter, printInvoice, type PrinterConnection } from './lib/bluetooth'
import { money } from './lib/format'
import Onboarding, { type NewTenantInput } from './components/Onboarding'
import PosView from './components/PosView'
import ProductsView from './components/ProductsView'
import ProductForm from './components/ProductForm'
import type { ProductInput } from './components/ProductForm'
import InvoicesView from './components/InvoicesView'
import InvoiceModal from './components/InvoiceModal'
import SettingsView, { type TenantUpdates } from './components/SettingsView'
import type { CashierInput } from './components/CashiersView'
import { LoginGate, SessionModal, type LoginHandler } from './components/Login'
import AuthScreen from './components/AuthScreen'
import { BrandLogo, Modal, Toast } from './components/Ui'

const NAV: { view: View; label: string; icon: LucideIcon }[] = [
  { view: 'ventas', label: 'Ventas', icon: ShoppingCart },
  { view: 'productos', label: 'Productos', icon: Package },
  { view: 'escanear', label: 'Escanear', icon: ScanLine },
  { view: 'facturas', label: 'Facturas', icon: ReceiptText },
  { view: 'configuracion', label: 'Configuración', icon: Settings },
]

const META: Record<View, { title: string; subtitle: string }> = {
  ventas: { title: 'Punto de venta', subtitle: 'Toca un producto para agregarlo y cobrar la compra.' },
  productos: { title: 'Productos', subtitle: 'Escanea códigos, toma fotos y controla tu stock.' },
  escanear: { title: 'Escanear código', subtitle: 'Usa la cámara del celular o de la computadora.' },
  facturas: { title: 'Facturas', subtitle: 'Reimprime o descarga cualquier compra.' },
  configuracion: { title: 'Configuración', subtitle: 'Personaliza tu negocio y su identidad.' },
}

const ScannerView = lazy(() => import('./components/ScannerView'))

const DEMO_PRODUCTS = [
  { barcode: '7790000000011', name: 'Leche entera 1 L', price: 3.5, stock: 24 },
  { barcode: '7790000000028', name: 'Pan de molde 500 g', price: 2.75, stock: 12 },
  { barcode: '7790000000035', name: 'Café molido 250 g', price: 6.9, stock: 4 },
]

export default function App() {
  const [ready, setReady] = useState(false)
  const [authChecked, setAuthChecked] = useState(!supabaseConfigured)
  const [authUser, setAuthUser] = useState<AuthUser | null>(null)
  const [tenants, setTenants] = useState<Tenant[]>([])
  const [tenant, setTenant] = useState<Tenant | null>(null)
  const [view, setView] = useState<View>('ventas')
  const [products, setProducts] = useState<Product[]>([])
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [cashiers, setCashiers] = useState<Cashier[]>([])
  const [cart, setCart] = useState<CartLine[]>([])
  const [session, setSession] = useState<Session>({ kind: 'owner' })
  const [sessionOpen, setSessionOpen] = useState(false)
  const [toast, setToast] = useState<{ id: number; message: string; error?: boolean } | null>(null)
  const [editing, setEditing] = useState<{ product?: Product; barcode?: string } | null>(null)
  const [scanOpen, setScanOpen] = useState(false)
  const [lastInvoice, setLastInvoice] = useState<Invoice | null>(null)
  const [printing, setPrinting] = useState(false)
  const [switchOpen, setSwitchOpen] = useState(false)
  const printerRef = useRef<PrinterConnection | null>(null)

  const notify = useCallback((message: string, error = false) => {
    setToast({ id: Date.now() + Math.random(), message, error })
  }, [])

  const errorMessage = (error: unknown) => (error instanceof Error ? error.message : String(error))

  const downloadPdf = async (invoice: Invoice) => {
    if (!tenant) return
    try {
      const { downloadInvoicePdf } = await import('./lib/pdf')
      downloadInvoicePdf(tenant, invoice)
    } catch {
      notify('No se pudo generar el PDF', true)
    }
  }

  const downloadTicket = async (invoice: Invoice) => {
    if (!tenant) return
    try {
      const { downloadTicketPdf } = await import('./lib/pdf')
      downloadTicketPdf(tenant, invoice)
    } catch {
      notify('No se pudo generar el ticket', true)
    }
  }

  // 1) Comprobar sesión de Supabase (en modo local no hay nada que hacer).
  useEffect(() => {
    if (!supabaseConfigured) return
    let cancelled = false
    void (async () => {
      try {
        const user = await getAuthUser()
        if (!cancelled) setAuthUser(user)
      } catch (error) {
        if (!cancelled) notify(errorMessage(error), true)
      } finally {
        if (!cancelled) setAuthChecked(true)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [notify])

  // 2) Cargar negocios del usuario (Supabase) o del dispositivo (local).
  useEffect(() => {
    if (!authChecked) return
    if (supabaseConfigured && !authUser) {
      setTenants([])
      setTenant(null)
      setReady(true)
      return
    }
    let cancelled = false
    void (async () => {
      try {
        const list = supabaseConfigured ? await fetchTenants() : await listTenants()
        if (cancelled) return
        setTenants(list)
        const slug = new URLSearchParams(window.location.search).get('t')
        const selected = (slug && list.find((item) => item.slug === slug)) || (list.length === 1 ? list[0] : null)
        setTenant(selected ?? null)
      } catch (error) {
        if (!cancelled) notify(errorMessage(error), true)
      } finally {
        if (!cancelled) setReady(true)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [authChecked, authUser, notify])

  const tenantId = tenant?.id
  useEffect(() => {
    if (!tenantId) return
    let cancelled = false
    void (async () => {
      try {
        if (supabaseConfigured) {
          const [loadedProducts, loadedInvoices, loadedCashiers, memberships] = await Promise.all([
            fetchProducts(tenantId),
            fetchInvoices(tenantId),
            fetchCashiers(tenantId),
            fetchMyMemberships(),
          ])
          if (cancelled) return
          setProducts(loadedProducts)
          setInvoices(loadedInvoices)
          setCashiers(loadedCashiers)
          const mine = memberships.find((item) => item.tenant_id === tenantId)
          if (mine?.role === 'cashier') {
            setSession({ kind: 'cashier', id: mine.user_id, name: mine.display_name })
          } else {
            setSession({ kind: 'owner' })
          }
        } else {
          const [loadedProducts, loadedInvoices, loadedCashiers] = await Promise.all([
            listProducts(tenantId),
            listInvoices(tenantId),
            listCashiers(tenantId),
          ])
          if (cancelled) return
          setProducts(loadedProducts)
          setInvoices(loadedInvoices)
          setCashiers(loadedCashiers)
          setSession({ kind: 'owner' })
        }
      } catch (error) {
        if (!cancelled) notify(errorMessage(error), true)
      }
    })()
    setCart([])
    const url = new URL(window.location.href)
    if (tenant) url.searchParams.set('t', tenant.slug)
    window.history.replaceState({}, '', url)
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId])

  useEffect(() => () => printerRef.current?.disconnect(), [])

  const createTenant = async (input: NewTenantInput) => {
    const base = slugify(input.name) || 'negocio'
    let slug = base
    let suffix = 2
    while (tenants.some((item) => item.slug === slug)) slug = `${base}-${suffix++}`
    let created: Tenant
    if (supabaseConfigured) {
      created = await createTenantRemote({
        slug,
        name: input.name,
        ruc: input.ruc,
        phone: input.phone,
        address: input.address,
        currency: input.currency,
        taxRate: input.taxRate,
      })
    } else {
      created = {
        id: newId(),
        slug,
        name: input.name,
        ruc: input.ruc,
        phone: input.phone,
        address: input.address,
        currency: input.currency,
        taxRate: input.taxRate,
        createdAt: Date.now(),
      }
      await putTenant(created)
    }
    setTenants((previous) => [...previous, created])
    setTenant(created)
    if (input.name === 'Demo Market') {
      for (const demo of DEMO_PRODUCTS) {
        const product = {
          ...demo,
          id: newId(),
          tenantId: created.id,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        }
        if (supabaseConfigured) await upsertProductRemote(product)
        else await putProduct(product)
      }
      setProducts(supabaseConfigured ? await fetchProducts(created.id) : await listProducts(created.id))
      notify('Negocio de ejemplo creado con 3 productos')
    } else {
      notify(`¡Bienvenido, ${created.name}!`)
    }
  }

  const saveTenant = async (updates: TenantUpdates) => {
    if (!tenant) return
    let updated = { ...tenant, ...updates }
    if (supabaseConfigured) {
      let logoUrl: string | undefined
      if (updates.logo !== undefined) {
        logoUrl = updates.logo.startsWith('data:') ? await uploadImage(updates.logo, tenant.id) : updates.logo
      }
      updated = await updateTenantRemote(updated, logoUrl)
    } else {
      await putTenant(updated)
    }
    setTenant(updated)
    setTenants((previous) => previous.map((item) => (item.id === updated.id ? updated : item)))
    notify('Datos del negocio guardados')
  }

  const saveCashier = async (input: CashierInput) => {
    if (!tenant) return
    const email = input.email.trim().toLowerCase()
    if (cashiers.some((item) => item.email === email && item.id !== input.id)) {
      return notify('Ya existe un cajero con ese correo', true)
    }
    const previous = cashiers.find((item) => item.id === input.id)
    if (!input.password && !previous) return notify('Escribe una contraseña para el cajero', true)

    let cashier: Cashier
    if (supabaseConfigured) {
      cashier = await saveCashierRemote({
        tenantId: tenant.id,
        userId: previous?.id,
        name: input.name,
        email,
        password: input.password || undefined,
        active: input.active,
      })
    } else {
      const credentials = input.password
        ? await hashPassword(input.password)
        : { salt: previous!.salt, passwordHash: previous!.passwordHash }
      cashier = {
        id: input.id ?? newId(),
        tenantId: tenant.id,
        name: input.name,
        email,
        ...credentials,
        active: input.active,
        createdAt: previous?.createdAt ?? Date.now(),
      }
      await putCashier(cashier)
    }
    setCashiers((items) => [...items.filter((item) => item.id !== cashier.id), cashier].sort((a, b) => a.name.localeCompare(b.name)))
    notify(supabaseConfigured ? 'Cajero guardado. Dile su correo y contraseña.' : 'Cajero guardado')
  }

  const removeCashier = async (cashier: Cashier) => {
    if (!window.confirm(`¿Eliminar al cajero ${cashier.name}?`)) return
    if (supabaseConfigured) await deactivateCashierRemote(cashier)
    else await deleteCashier(cashier.id)
    setCashiers((items) => items.filter((item) => item.id !== cashier.id))
    if (session.kind === 'cashier' && session.id === cashier.id) setSession({ kind: 'owner' })
    notify('Cajero eliminado')
  }

  const handleDeleteTenant = async () => {
    if (!tenant || !window.confirm(`¿Eliminar "${tenant.name}" y todos sus datos? Esta acción no se puede deshacer.`)) return
    if (supabaseConfigured) await deleteTenantRemote(tenant.id)
    else await removeTenantData(tenant.id)
    const remaining = tenants.filter((item) => item.id !== tenant.id)
    setTenants(remaining)
    setTenant(remaining[0] ?? null)
    const url = new URL(window.location.href)
    url.searchParams.delete('t')
    window.history.replaceState({}, '', url)
    setSwitchOpen(false)
    notify('Negocio eliminado')
  }

  const saveProduct = async (input: ProductInput) => {
    if (!tenant) return
    const existing = input.barcode
      ? supabaseConfigured
        ? products.find((item) => item.barcode === input.barcode)
        : await getProductByBarcode(tenant.id, input.barcode)
      : undefined
    if (existing && existing.id !== editing?.product?.id) {
      notify(`El código ${input.barcode} ya pertenece a ${existing.name}`, true)
      return
    }
    const now = Date.now()
    const product: Product = {
      ...input,
      id: editing?.product?.id ?? newId(),
      tenantId: tenant.id,
      createdAt: editing?.product?.createdAt ?? now,
      updatedAt: now,
    }
    let saved = product
    if (supabaseConfigured) {
      const imageUrl = product.image?.startsWith('data:') ? await uploadImage(product.image, tenant.id) : product.image
      saved = await upsertProductRemote(product, imageUrl)
    } else {
      await putProduct(product)
    }
    setProducts((previous) =>
      [...previous.filter((item) => item.id !== saved.id), saved].sort((a, b) => a.name.localeCompare(b.name)),
    )
    setEditing(null)
    notify('Producto guardado')
  }

  const handleDeleteProduct = async (product: Product) => {
    if (!window.confirm(`¿Eliminar "${product.name}"?`)) return
    if (supabaseConfigured) await deleteProductRemote(product.id)
    else await removeProductData(product.id)
    setProducts((previous) => previous.filter((item) => item.id !== product.id))
    setCart((previous) => previous.filter((line) => line.productId !== product.id))
    notify('Producto eliminado')
  }

  const adjustStock = async (product: Product, delta: number) => {
    const stock = Math.max(0, product.stock + delta)
    const updated = { ...product, stock, updatedAt: Date.now() }
    let saved = updated
    if (supabaseConfigured) saved = await upsertProductRemote(updated)
    else await putProduct(updated)
    setProducts((previous) => previous.map((item) => (item.id === product.id ? saved : item)))
  }

  const handleScanResult = (code: string) => {
    const found = products.find((product) => product.barcode === code)
    setScanOpen(false)
    if (found) {
      setEditing({ product: found })
      notify(`Producto encontrado: ${found.name}`)
    } else {
      setEditing({ barcode: code })
      notify(`Código ${code} listo para registrar`)
    }
  }

  const addToCart = (product: Product) => {
    if (product.stock <= 0) return notify('Sin stock disponible', true)
    setCart((previous) => {
      const line = previous.find((item) => item.productId === product.id)
      if (!line) {
        return [
          ...previous,
          { productId: product.id, barcode: product.barcode, name: product.name, price: product.price, image: product.image, qty: 1 },
        ]
      }
      if (line.qty >= product.stock) {
        notify('No hay más stock de este producto', true)
        return previous
      }
      return previous.map((item) => (item.productId === product.id ? { ...item, qty: item.qty + 1 } : item))
    })
  }

  const changeQty = (productId: string, delta: number) => {
    setCart((previous) => {
      const line = previous.find((item) => item.productId === productId)
      if (!line) return previous
      const qty = line.qty + delta
      if (qty <= 0) return previous.filter((item) => item.productId !== productId)
      const product = products.find((item) => item.id === productId)
      if (product && qty > product.stock) {
        notify('No hay más stock de este producto', true)
        return previous
      }
      return previous.map((item) => (item.productId === productId ? { ...item, qty } : item))
    })
  }

  const checkout = async (payment: PaymentMethod, customer: string) => {
    if (!tenant || cart.length === 0) return
    for (const line of cart) {
      const product = products.find((item) => item.id === line.productId)
      if (!product || product.stock < line.qty) return notify('Stock insuficiente para completar la venta', true)
    }
    const subtotal = cart.reduce((sum, line) => sum + line.price * line.qty, 0)
    const tax = subtotal * tenant.taxRate
    const sale = {
      tenantId: tenant.id,
      lines: cart,
      subtotal,
      tax,
      total: subtotal + tax,
      payment,
      customer: customer || undefined,
      cashierName: session.kind === 'cashier' ? session.name : undefined,
    }
    let invoice: Invoice
    if (supabaseConfigured) {
      invoice = await recordSaleRemote(sale)
      setProducts((previous) =>
        previous.map((item) => {
          const line = cart.find((entry) => entry.productId === item.id)
          return line ? { ...item, stock: item.stock - line.qty, updatedAt: Date.now() } : item
        }),
      )
    } else {
      invoice = {
        id: newId(),
        ...sale,
        number: await nextInvoiceNumber(tenant.id),
        createdAt: Date.now(),
      }
      await putInvoice(invoice)
      for (const line of cart) {
        const product = products.find((item) => item.id === line.productId)!
        const updated = { ...product, stock: product.stock - line.qty, updatedAt: Date.now() }
        await putProduct(updated)
        setProducts((previous) => previous.map((item) => (item.id === updated.id ? updated : item)))
      }
    }
    setInvoices((previous) => [invoice, ...previous])
    setCart([])
    setLastInvoice(invoice)
    notify(`Venta guardada · ${money(invoice.total, tenant.currency)}`)
  }

  const handleBluetooth = async (invoice: Invoice) => {
    if (!tenant) return
    setPrinting(true)
    try {
      if (!printerRef.current) printerRef.current = await connectPrinter()
      await printInvoice(printerRef.current, tenant, invoice)
      notify('Factura enviada a la impresora Bluetooth')
    } catch (error) {
      printerRef.current = null
      notify(error instanceof Error ? error.message : 'No se pudo imprimir', true)
    } finally {
      setPrinting(false)
    }
  }

  const handleCashierLogin: LoginHandler = async (email, password) => {
    if (supabaseConfigured) {
      await signIn(email, password)
      const user = await getAuthUser()
      const memberships = await fetchMyMemberships()
      const mine = memberships.find((item) => item.tenant_id === tenant?.id && item.user_id === user?.id)
      if (!mine || mine.role !== 'cashier' || !mine.active) {
        throw new Error('Ese usuario no es cajero de este negocio')
      }
      setSession({ kind: 'cashier', id: mine.user_id, name: mine.display_name })
      notify(`Hola, ${mine.display_name}`)
    } else {
      const cashier = cashiers.find((item) => item.email === email.trim().toLowerCase())
      if (!cashier || !cashier.active) throw new Error('Correo no encontrado o cuenta inactiva')
      if (!cashier.salt || !cashier.passwordHash || !(await verifyPassword(password, cashier))) {
        throw new Error('Contraseña incorrecta')
      }
      setSession({ kind: 'cashier', id: cashier.id, name: cashier.name })
      notify(`Hola, ${cashier.name}`)
    }
  }

  if (supabaseConfigured && authChecked && !authUser) {
    return (
      <>
        <AuthScreen
          onAuthenticated={async () => setAuthUser(await getAuthUser())}
          onToast={notify}
        />
        {toast && <Toast key={toast.id} message={toast.message} error={toast.error} onClose={() => setToast(null)} />}
      </>
    )
  }

  if (!ready) {
    return <div className="onboarding"><div className="brand-mark"><ShoppingBasket size={28} /></div></div>
  }

  if (!tenant) {
    return (
      <>
        <Onboarding
          tenants={tenants}
          onCreate={createTenant}
          onOpen={setTenant}
          onError={(message) => notify(message, true)}
        />
        {toast && <Toast key={toast.id} message={toast.message} error={toast.error} onClose={() => setToast(null)} />}
      </>
    )
  }

  const meta = META[view]

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-lockup">
          <div className="brand-mark"><ShoppingBasket size={22} /></div>
          <div>
            <div className="brand-name">Mercadito ROMO</div>
            <div className="brand-sub">Punto de venta</div>
          </div>
        </div>
        <div>
          <div className="nav-label">Menú</div>
          <nav className="nav-list">
            {NAV.map(({ view: itemView, label, icon: Icon }) => (
              <button key={itemView} className={`nav-item${view === itemView ? ' active' : ''}`} onClick={() => setView(itemView)}>
                <Icon size={18} /> {label}
              </button>
            ))}
          </nav>
        </div>
        <div className="sidebar-foot">
          <strong>Consejo</strong><br />
          {supabaseConfigured
            ? <>Tus datos se sincronizan con Supabase. Abre <b>?t={tenant.slug}</b> en otro dispositivo e ingresa con tu cuenta.</>
            : <>Usa el enlace <b>?t={tenant.slug}</b> para abrir este negocio en otro dispositivo. Los datos se guardan en cada equipo.</>}
          {supabaseConfigured && (
            <button
              className="btn btn-ghost btn-block"
              style={{ marginTop: 10 }}
              onClick={async () => {
                await signOut()
                setAuthUser(null)
              }}
            >
              Cerrar sesión
            </button>
          )}
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <div className="topbar-title">
            <h1>{meta.title}</h1>
            <p>{meta.subtitle}</p>
          </div>
          <div className="topbar-actions">
            <button className="brand-chip" onClick={() => setSwitchOpen(true)} title="Cambiar de negocio">
              <BrandLogo tenant={tenant} />
              <span>
                {tenant.name}
                <small>{tenant.currency} · {products.length} productos</small>
              </span>
              <Users size={14} className="muted" />
            </button>
            <button className="brand-chip" onClick={() => setSessionOpen(true)} title="Cajero actual">
              <div className="brand-logo"><UserRound size={16} /></div>
              <span>
                {session.kind === 'owner' ? 'Dueño' : session.name}
                <small>{session.kind === 'owner' ? 'Modo administrador' : 'Cajero activo'}</small>
              </span>
            </button>
          </div>
        </header>

        {view === 'ventas' && tenant.requireLogin && session.kind !== 'cashier' && (
          <LoginGate
            onLogin={handleCashierLogin}
            onToast={notify}
            onOpenSettings={() => setView('configuracion')}
            secondaryAction={supabaseConfigured
              ? {
                  label: 'Entrar como dueño',
                  onClick: async () => {
                    await signOut()
                    setAuthUser(null)
                  },
                }
              : undefined}
          />
        )}

        {view === 'ventas' && (!tenant.requireLogin || session.kind === 'cashier') && (
          <PosView
            products={products}
            cart={cart}
            currency={tenant.currency}
            taxRate={tenant.taxRate}
            onAdd={addToCart}
            onQty={changeQty}
            onClear={() => setCart([])}
            onCheckout={checkout}
            onScan={() => setScanOpen(true)}
          />
        )}

        {view === 'productos' && (
          <ProductsView
            products={products}
            currency={tenant.currency}
            onNew={() => setEditing({})}
            onScan={() => setScanOpen(true)}
            onEdit={(product) => setEditing({ product })}
            onDelete={handleDeleteProduct}
            onAdjustStock={adjustStock}
          />
        )}

        {view === 'escanear' && (
          <div className="grid two-col">
            <section className="card pad-lg">
              <div className="card-title"><h2>Escáner de código de barras</h2><span className="badge">Cámara</span></div>
              <Suspense fallback={<p className="small muted">Cargando escáner…</p>}>
                <ScannerView onResult={handleScanResult} onToast={notify} />
              </Suspense>
            </section>
            <section className="card pad-lg stack" style={{ alignSelf: 'start' }}>
              <div className="card-title" style={{ marginBottom: 0 }}><h2>¿Cómo funciona?</h2></div>
              <p className="small muted">Escanea el código de tu producto. Si ya existe, podrás editarlo y sumar stock; si es nuevo, se abrirá el formulario con el código cargado.</p>
              <div className="divider" />
              <div className="row small"><span className="badge">1</span> Escanea o escribe el código</div>
              <div className="row small"><span className="badge">2</span> Toma la foto del producto</div>
              <div className="row small"><span className="badge">3</span> Pon precio y stock</div>
              <div className="row small"><span className="badge">4</span> Vende e imprime la factura</div>
            </section>
          </div>
        )}

        {view === 'facturas' && (
          <InvoicesView
            invoices={invoices}
            tenant={tenant}
            onPdf={downloadPdf}
            onTicket={downloadTicket}
            onBluetooth={handleBluetooth}
          />
        )}

        {view === 'configuracion' && (
          <SettingsView
            tenant={tenant}
            cashiers={cashiers}
            onSave={saveTenant}
            onSaveCashier={saveCashier}
            onDeleteCashier={removeCashier}
            onDelete={handleDeleteTenant}
            onSwitch={() => setSwitchOpen(true)}
            onToast={notify}
          />
        )}
      </main>

      <nav className="bottom-nav">
        {NAV.map(({ view: itemView, label, icon: Icon }) => (
          <button key={itemView} className={view === itemView ? 'active' : ''} onClick={() => setView(itemView)}>
            <Icon size={19} /> {label}
          </button>
        ))}
      </nav>

      {editing && (
        <ProductForm
          product={editing.product}
          initialBarcode={editing.barcode}
          currency={tenant.currency}
          onSave={saveProduct}
          onClose={() => setEditing(null)}
          onToast={notify}
        />
      )}

      {scanOpen && (
        <Modal title="Escanear producto" subtitle="Apunta al código de barras" onClose={() => setScanOpen(false)}>
          <Suspense fallback={<p className="small muted">Cargando escáner…</p>}>
            <ScannerView onResult={handleScanResult} onToast={notify} />
          </Suspense>
        </Modal>
      )}

      {sessionOpen && (
        <SessionModal
          session={session}
          onLogin={handleCashierLogin}
          onLogout={async () => {
            if (supabaseConfigured) {
              await signOut()
              setAuthUser(null)
            } else {
              setSession({ kind: 'owner' })
            }
          }}
          onClose={() => setSessionOpen(false)}
          onToast={notify}
        />
      )}

      {lastInvoice && (
        <InvoiceModal
          invoice={lastInvoice}
          tenant={tenant}
          printing={printing}
          onClose={() => setLastInvoice(null)}
          onPdf={() => downloadPdf(lastInvoice)}
          onTicket={() => downloadTicket(lastInvoice)}
          onBluetooth={() => handleBluetooth(lastInvoice)}
        />
      )}

      {switchOpen && (
        <Modal title="Cambiar de negocio" subtitle="Cada negocio tiene sus propios datos" onClose={() => setSwitchOpen(false)}>
          <div className="stack">
            {tenants.map((item) => (
              <button key={item.id} className="tenant-card" onClick={() => { setTenant(item); setSwitchOpen(false) }}>
                <BrandLogo tenant={item} size={40} />
                <span style={{ flex: 1 }}><strong style={{ display: 'block' }}>{item.name}</strong><small className="muted">?t={item.slug}</small></span>
                {item.id === tenant.id && <span className="badge ok">Actual</span>}
              </button>
            ))}
            <button className="btn btn-gold btn-block" onClick={() => { setTenant(null); setSwitchOpen(false) }}>
              <Plus size={16} /> Crear otro negocio
            </button>
          </div>
        </Modal>
      )}

      {toast && <Toast key={toast.id} message={toast.message} error={toast.error} onClose={() => setToast(null)} />}
    </div>
  )
}
