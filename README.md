# Ordanza POS

Inventario con punto de venta multicaja: ventas con lector o cámara, cortes de caja, etiquetas con código de barras, agenda, bitácora y reportes. Multi-tenant: un solo despliegue atiende a varios negocios.

**Stack:** Next.js 16 (App Router) · React 19 · TypeScript · Prisma 7 + Postgres (Neon) · CSS propio.

## Arranque local

```bash
npm install
cp .env.example .env          # pon tu DATABASE_URL y un AUTH_SECRET (openssl rand -base64 32)
npx prisma migrate dev --name init   # crea las tablas y la carpeta prisma/migrations
npm run db:seed               # negocio demo
npm run dev
```

Demo: `admin@demo.mx` / `ordanza123` (PIN 1234). Cajero PIN 2222, almacén PIN 3333.

> La primera vez, sube a git la carpeta `prisma/migrations` que genera `migrate dev`. Producción la necesita.

## Despliegue (Vercel + Neon)

1. Crea la base en Neon y copia la cadena **pooled**.
2. En Vercel, variables: `DATABASE_URL`, `AUTH_SECRET` y, solo si quieres alta pública de negocios, `REGISTRO_ABIERTO=true`.
3. Build command: `prisma migrate deploy && npm run build`.

## Cómo está armado

- **Existencia = suma de movimientos.** No hay campo `stock`: cada entrada, salida, ajuste, venta o cancelación es un renglón en `Movimiento`. Así varias cajas no descuadran el inventario.
- **Ventas idempotentes.** Cada cobro lleva un `clientId` generado en el navegador; si se reintenta, no se duplica. Esto es la base del modo offline.
- **Folios por caja** (`C1-000001`) con consecutivo transaccional.
- **Toda consulta filtra por `tenantId`.**
- **Roles:** Administrador (todo), Cajero (vender, consultar, agenda), Almacén (productos, inventario, etiquetas).
- **Acceso:** el administrador entra con correo y contraseña. En **Ajustes → Este equipo** se vincula cada computadora a una caja; ahí los cajeros entran con su nombre y PIN. Hay bloqueo de 5 minutos tras 5 intentos fallidos.
- **Impresión:** `/imprimir/ticket/[id]`, `/imprimir/corte/[id]` y `/imprimir/etiquetas` salen al tamaño del papel (ticket 58/80 mm; etiquetas 50×25, 40×30 o carta). Con Chrome en modo kiosco (`--kiosk-printing`) imprimen directo sin diálogo.
- **CSV:** `/api/export/{ventas|productos|movimientos|bitacora}?desde=YYYY-MM-DD&hasta=YYYY-MM-DD`.

## Rutas

| Ruta | Rol |
|---|---|
| `/inicio` | Todos |
| `/venta` | Admin, Cajero |
| `/escanear`, `/productos`, `/agenda` | Todos |
| `/inventario`, `/etiquetas` | Admin, Almacén |
| `/reportes`, `/bitacora`, `/ajustes`, `/ventas/[id]` | Admin |

## Siguientes fases

1. App de escritorio con Tauri: impresión ESC/POS directa y apertura de cajón.
2. Modo offline: cola de ventas en IndexedDB que sincroniza con el `clientId`.
3. Facturación CFDI con un PAC.
