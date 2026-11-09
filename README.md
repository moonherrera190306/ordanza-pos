# Ordanza POS

Inventario con punto de venta multicaja: ventas con lector o cámara, pago mixto, crédito a clientes, devoluciones, entradas y retiros de caja, cortes, compras a proveedores, importación desde Excel, etiquetas con código de barras, agenda, bitácora y reportes. Multi-tenant: un solo despliegue atiende a varios negocios, con panel interno de licencias para Ordanza.

**Stack:** Next.js 16 (App Router) · React 19 · TypeScript · Prisma 7 + Postgres (Neon) · CSS propio.

## Arranque local

```bash
npm install
cp .env.example .env          # pon tu DATABASE_URL y un AUTH_SECRET (openssl rand -base64 32)
npx prisma migrate dev --name init   # crea las tablas y la carpeta prisma/migrations
npm run db:seed               # negocio demo
npm run dev
```

Demo: `admin@demo.mx` / `ordanza123` (PIN 1234). Cajero PIN 2222, almacén PIN 3333. Para ver `/ordanza` en local pon `SUPERADMIN_EMAILS="admin@demo.mx"` en tu `.env`.

> La primera vez, sube a git la carpeta `prisma/migrations` que genera `migrate dev`. Producción la necesita.

## Despliegue (Vercel + Neon)

1. Crea la base en Neon y copia la cadena **pooled**.
2. En Vercel, variables: `DATABASE_URL`, `AUTH_SECRET`, `SUPERADMIN_EMAILS` (correos de Ordanza con acceso a `/ordanza`) y, solo si quieres alta pública de negocios, `REGISTRO_ABIERTO=true`.
3. Build command: `prisma migrate deploy && npm run build`.

## Cómo está armado

- **Existencia = suma de movimientos.** No hay campo `stock`: cada entrada, salida, ajuste, venta o cancelación es un renglón en `Movimiento`. Así varias cajas no descuadran el inventario.
- **Ventas idempotentes.** Cada cobro lleva un `clientId` generado en el navegador; si se reintenta, no se duplica. Esto es la base del modo offline.
- **Folios por caja** (`C1-000001`) con consecutivo transaccional.
- **Toda consulta filtra por `tenantId`.**
- **Roles:** Administrador (todo), Cajero (vender, consultar, agenda), Almacén (productos, inventario, etiquetas).
- **Acceso:** el administrador entra con correo y contraseña. En **Ajustes → Este equipo** se vincula cada computadora a una caja; ahí los cajeros entran con su nombre y PIN. Hay bloqueo de 5 minutos tras 5 intentos fallidos.
- **Impresión:** `/imprimir/ticket/[id]`, `/imprimir/corte/[id]` y `/imprimir/etiquetas` salen al tamaño del papel (ticket 58/80 mm; etiquetas 50×25, 40×30 o carta). Con Chrome en modo kiosco (`--kiosk-printing`) imprimen directo sin diálogo.
- **Pagos.** Cada venta guarda sus formas de pago en `VentaPago` (efectivo ya sin el cambio). El corte suma: fondo + ventas en efectivo + abonos en efectivo + entradas − retiros − devoluciones en efectivo.
- **Crédito.** `MovCliente` es la cuenta del cliente: CARGO por venta a crédito, ABONO por pago, devolución o cancelación. Saldo = cargos − abonos. Límite 0 = sin crédito; solo un administrador lo asigna.
- **Devoluciones parciales.** Regresan existencia (`Movimiento` DEVOLUCION) y el dinero en efectivo, tarjeta, transferencia o abono a la cuenta. Respetan el descuento del ticket. Una venta con devoluciones ya no se cancela completa.
- **PIN de supervisor.** Si el usuario es cajero, descuentos, retiros y devoluciones piden el PIN de un administrador (se configura en Ajustes). Queda en la bitácora quién autorizó.
- **Compras.** Suman existencia (`Movimiento` COMPRA), actualizan el costo con promedio ponderado y, si se marca, salen de la caja como retiro.
- **Importar Excel.** `/productos/importar` lee .xlsx o .csv en el navegador, detecta columnas, deja corregir el mapeo y muestra vista previa. Empata por código, SKU o nombre.
- **Licencias.** `/ordanza` (solo `SUPERADMIN_EMAILS`): alta de negocios, plan, cajas incluidas, vigencia, suspensión y respaldo. El límite de cajas se valida al crear o activar una caja; un negocio suspendido no puede entrar; con la licencia vencida, el administrador ve un aviso.
- **Respaldo.** `/api/respaldo` descarga todo el negocio en JSON (sin contraseñas ni PIN).
- **CSV:** `/api/export/{ventas|productos|movimientos|bitacora}?desde=YYYY-MM-DD&hasta=YYYY-MM-DD`.

## Versión local (pago único, Windows)

Se instala en la compu del cliente con su propia base de datos Postgres; no necesita internet para vender. Las demás cajas y tablets entran por la red del negocio (`http://NOMBRE-PC:3070`).

```bash
instalador/construir.sh          # → dist/OrdanzaPOS-Setup-<versión>.exe (se arma desde Linux o Mac)
instalador/construir.sh linux    # → dist/ordanza-linux/ para probar el lanzador sin Windows
```

- **Qué instala:** Node 22, Postgres 17 embebido y la app en `C:\Program Files\Ordanza POS`; los datos en `C:\ProgramData\OrdanzaPOS`. Crea accesos directos, arranque automático del servidor al iniciar sesión y la regla de firewall del puerto 3070.
- **Lanzador** (`instalador/lanzador/ordanza.mjs`): crea la base la primera vez, aplica `instalador/migraciones/*.sql` en orden y levanta el servidor con `MODO=local`. Abre el sistema en ventana propia de Edge o Chrome con impresión directa (`--kiosk-printing`).
- **Esquema:** la versión local no usa `prisma migrate`. Cada cambio a `schema.prisma` lleva también un archivo nuevo `instalador/migraciones/00N_….sql`.
- **Respaldos:** uno diario en `Documentos\Ordanza Respaldos` y en `C:\ProgramData\OrdanzaPOS\respaldos` (se guardan 30). En el menú Inicio están "Respaldar ahora" y "Restaurar respaldo" (se arrastra el archivo encima).
- **Licencia:** 15 días de prueba completos. Después, sin licencia, el sistema queda en modo consulta (no deja abrir caja ni cobrar). La licencia es una clave firmada (Ed25519) amarrada al código de equipo que el cliente ve en **Ajustes → Licencia**, y fija el número de cajas.
  - Genérala en `/ordanza` → **Licencia local**, o con `node scripts/licencia.mjs "Negocio" XXXX-XXXX-XXXX-XXXX 2`.
  - Ambas necesitan `LICENCIA_PRIVADA` en tu `.env`. **Nunca la subas a git.**

## Rutas

| Ruta | Rol |
|---|---|
| `/inicio` | Todos |
| `/venta` | Admin, Cajero |
| `/escanear`, `/productos`, `/agenda` | Todos |
| `/clientes` | Admin, Cajero |
| `/inventario`, `/compras`, `/etiquetas`, `/productos/importar` | Admin, Almacén |
| `/reportes`, `/bitacora`, `/ajustes`, `/ventas/[id]` | Admin |
| `/ordanza` | Personal de Ordanza |

## Siguientes fases

1. App de escritorio con Tauri: impresión ESC/POS directa y apertura de cajón.
2. Modo offline: cola de ventas en IndexedDB que sincroniza con el `clientId`.
3. Facturación CFDI con un PAC.
