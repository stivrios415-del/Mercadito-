# Mercadito ROMO

PWA (web instalable) para supermercados y pulperías: multinegocio, escáner de código de barras con cámara, foto del producto, stock, carrito, facturas en PDF y impresión térmica Bluetooth. Diseño minimalista blanco/dorado con glasmorfismo, responsivo para PC y celular.

## Ejecutar

Requiere Node 20 o superior.

```bash
npm install
npm run dev
```

Abre `http://localhost:5173`. Para probar rápido, pulsa **Probar con negocio de ejemplo** (crea 3 productos con códigos de barras).

Build de producción:

```bash
npm run build
npm run preview
```

La PWA (service worker e instalación) se registra solo en producción y necesita HTTPS o `localhost`. Si despliegas una versión nueva, cambia el nombre `CACHE` en `public/sw.js` para renovar la caché.

## Cómo usar

1. **Crear negocio:** escribe el nombre; el sistema genera un enlace `?t=mi-negocio`. Cada negocio (tenant) tiene logo, productos, stock, cajeros y facturas separados.
2. **Configuración:** cambia nombre, logo, RUC/NIF, teléfono, dirección, moneda e impuesto. En **Mis cajeros** crea cuentas con correo y contraseña. Activa **Exigir login para vender** si quieres que solo los cajeros cobren.
3. **Productos / Escanear:** escanea el código (EAN-13, UPC, Code 128, Code 39, ITF, QR) o escríbelo manualmente; toma la foto, pon precio y stock. Si el código ya existe, se abre el producto para editarlo.
4. **Ventas:** toca los productos, elige método de pago y cobra. El stock se descuenta automáticamente.
5. **Factura:** al cobrar puedes descargar PDF A4, ticket 80 mm o imprimir en impresora térmica Bluetooth (ESC/POS). También puedes reimprimir desde **Facturas**.

## Datos y almacenamiento

Los datos se guardan en **IndexedDB por negocio**, en el navegador/dispositivo donde se usan. El enlace `?t=slug` permite abrir el mismo negocio en otro equipo, pero **el contenido no se sincroniza entre dispositivos todavía**. La capa de datos está aislada en `src/lib/db.ts` para conectar un backend más adelante.

## Impresión Bluetooth

Usa la API **Web Bluetooth** y comandos ESC/POS. Funciona en Chrome/Edge (PC Android/Windows) con HTTPS o localhost. **No funciona en Safari de iOS**; en ese caso usa el PDF o el ticket 80 mm. La app detecta varios UUID de servicio comunes de impresoras térmicas; si tu impresora usa otro, hay que agregarlo en `src/lib/bluetooth.ts`.

## Seguridad

Las contraseñas de cajeros se guardan como **SHA-256 con sal** (`src/lib/auth.ts`), nunca en texto plano. Esto es adecuado para el prototipo local; para producción conviene un backend con HTTPS y hashing lento (bcrypt/Argon2), roles y auditoría.

## Estructura

- `src/lib/db.ts` — IndexedDB multitenant (tenants, products, invoices, cashiers).
- `src/lib/bluetooth.ts` — conexión y comandos ESC/POS.
- `src/lib/pdf.ts` — factura A4 y ticket 80 mm (jsPDF, carga diferida).
- `src/components/ScannerView.tsx` — escáner con ZXing (carga diferida).
- `src/App.tsx` — orquestación de tenants, cajeros, carrito y facturación.
