# Mercadito ROMO

PWA (web instalable) para supermercados y pulperías: escáner de código de barras con cámara, foto del producto, stock, carrito, facturas en PDF o impresora Bluetooth, **reportes de ventas en PDF/Excel** y **análisis de inversión, ganancias y pérdidas**. Diseño minimalista blanco/dorado con glasmorfismo, responsivo para PC y celular.

## Ejecutar

Requiere Node 20 o superior.

```bash
npm install
npm run dev
```

Abre `http://localhost:5173`. Para probar rápido, pulsa **Probar con negocio de ejemplo** (crea 3 productos con costo, precio y código de barras).

Build de producción:

```bash
npm run build
npm run preview
```

La PWA (service worker e instalación) se registra solo en producción y necesita HTTPS o `localhost`. Si despliegas una versión nueva, cambia el nombre `CACHE` en `public/sw.js` (ya quedó en `mercadito-romo-v4`).

## Cómo usar

1. **Crear negocio:** cada dueño crea su propio negocio; el sistema genera un enlace `?t=mi-negocio` con datos separados (logo, productos, stock, cajeros y facturas).
2. **Configuración:** cambia nombre, logo, RUC/NIF, teléfono, dirección, moneda e impuesto. En **Mis cajeros** crea cuentas con correo y contraseña. Activa **Exigir login para vender** si quieres que solo los cajeros cobren.
3. **Productos / Escanear:** escanea el código o escríbelo manualmente; toma la foto y pon **precio de venta**, **costo unitario** y stock. El costo es la base del análisis de inversiones y pérdidas.
4. **Ventas:** toca los productos, elige método de pago y cobra. El stock se descuenta automáticamente.
5. **Factura:** descarga PDF A4, ticket 80 mm o imprime en térmica Bluetooth. También puedes reimprimir desde **Facturas**.
6. **Reportes:** elige **Diario / Semanal / Mensual** y una fecha de referencia. Descarga el reporte en **PDF** o **Excel `.xlsx` real** (hojas Resumen, Productos y Análisis). El panel muestra inversión en inventario (`costo × stock`), costo de lo vendido, ganancia bruta, pérdidas por mermas y resultado neto.
7. **Mermas:** en Reportes → *Registrar pérdida / merma* das de baja unidades por daño, vencimiento, robo u otro motivo; se descuenta el stock y se contabiliza el valor perdido.
8. **Cerrar sesión:** el botón **Salir** de la barra superior (visible también en celular) y la opción *Cerrar sesión* del menú funcionan para **todos**: dueños y cajeros. Al salir se limpia el carrito y vuelve a la pantalla de ingreso (con Supabase, al login con correo y contraseña; en modo local, al selector de negocio para volver a entrar).

## Dueño del software (super-admin)

La cuenta `stivrios415@gmail.com` es la única que ve **Admin** en el menú. Desde ahí puede ver todos los negocios, el correo del dueño, sus ventas y controlar pagos:

- **Cobrar:** concede 30 días de acceso.
- **Fecha:** fija una fecha de vencimiento manual.
- **Bloquear / Desbloquear:** bloqueo inmediato.
- **Abrir:** entra a cualquier negocio para dar soporte.

Un negocio **vencido o bloqueado** puede consultar sus datos y facturas, pero **no puede cobrar ventas**: el bloqueo se aplica en la interfaz, en la RPC `record_sale` y en las políticas RLS de escrituras. El multinegocio (crear/cambiar de negocio) solo aparece para esta cuenta; los dueños normales administran un solo negocio.

## Datos y almacenamiento

- Con credenciales de Supabase en `.env` / variables de Vercel: Auth, Postgres (RLS por tenant) y Storage (`aurora-images`). Las ventas se graban de forma atómica con `public.record_sale(...)`.
- Sin credenciales: la app funciona igual en modo local con IndexedDB (`aurora-pos`), ideal para probar sin backend.
- Las credenciales **nunca** se versionan: `.env` está en `.gitignore` y en Vercel se configuran en el dashboard.

## Base de datos

Ejecuta `supabase/schema.sql` en **Supabase → SQL Editor → New query → Run**. Es idempotente: conserva los datos y agrega las columnas y tablas nuevas (`products.cost`, `tenants.paid_until`, `tenants.blocked`, `stock_losses`, `super_admins`) además de las funciones y políticas de pago.

El cajero se crea con la Edge Function `manage-cashier` (usa `service_role`). Si aún no está desplegada:

```bash
supabase login
supabase functions deploy manage-cashier --project-ref uqiobjrvsgmdxvhnzggj
```

## Impresión Bluetooth

Usa la API **Web Bluetooth** y comandos ESC/POS. Funciona en Chrome/Edge (PC/Android/Windows) con HTTPS o localhost. **No funciona en Safari de iOS**; en ese caso usa el PDF o el ticket 80 mm.

## Seguridad

Las contraseñas de cajeros se guardan como hash (SHA-256 con sal) en modo local; con Supabase se usa Auth. El panel de pagos está protegido por `public.is_super_admin()` tanto en la app como en el servidor, y los dueños no pueden alterar su estado de pago (trigger `guard_tenant_billing`).

## Estructura

- `src/lib/db.ts` — IndexedDB multitenant (tenants, products, invoices, cashiers, losses).
- `src/lib/remote.ts` — Supabase: mappers, CRUD, `record_sale`, `record_stock_loss`, panel admin.
- `src/lib/billing.ts` — suscripción, super-admin y bloqueo de ventas.
- `src/lib/report.ts` — cálculo de períodos, ventas, pago, inversión y pérdidas.
- `src/lib/pdf.ts` — factura A4, ticket 80 mm y reporte PDF.
- `src/lib/excel.ts` — reporte `.xlsx` (write-excel-file).
- `src/components/ReportsView.tsx` — filtros, análisis y registro de mermas.
- `src/components/AdminView.tsx` — panel privado de negocios y cobros.
- `src/App.tsx` — orquestación de tenants, cajeros, carrito, facturación y vistas.
