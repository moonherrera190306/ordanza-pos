import { prisma } from "./db";

/** Respaldo completo de un negocio en JSON (sin contraseñas ni PIN). Los datos son del cliente. */
export async function respaldoTenant(tid: string) {
  const w = { where: { tenantId: tid } };
  const [tenant, usuarios, cajas, turnos, categorias, productos, movimientos, ventas, clientes, movsCliente, movsCaja, proveedores, compras, devoluciones, citas, bitacora] =
    await Promise.all([
      prisma.tenant.findUnique({ where: { id: tid } }),
      prisma.usuario.findMany({ ...w, select: { id: true, nombre: true, email: true, rol: true, activo: true, creado: true } }),
      prisma.caja.findMany(w),
      prisma.turno.findMany(w),
      prisma.categoria.findMany(w),
      prisma.producto.findMany(w),
      prisma.movimiento.findMany(w),
      prisma.venta.findMany({ ...w, include: { items: true, pagos: true } }),
      prisma.cliente.findMany(w),
      prisma.movCliente.findMany(w),
      prisma.movCaja.findMany(w),
      prisma.proveedor.findMany(w),
      prisma.compra.findMany({ ...w, include: { items: true } }),
      prisma.devolucion.findMany({ ...w, include: { items: true } }),
      prisma.cita.findMany(w),
      prisma.bitacora.findMany(w),
    ]);
  return {
    formato: "ordanza-pos/1", generado: new Date().toISOString(),
    negocio: tenant, usuarios, cajas, turnos, categorias, productos, movimientos, ventas, clientes, movsCliente, movsCaja, proveedores, compras, devoluciones, citas, bitacora,
  };
}

export function respaldoResponse(data: unknown, slug: string) {
  const fecha = new Date().toISOString().slice(0, 10);
  return new Response(JSON.stringify(data, null, 1), {
    headers: { "Content-Type": "application/json; charset=utf-8", "Content-Disposition": `attachment; filename="respaldo-${slug}-${fecha}.json"` },
  });
}
