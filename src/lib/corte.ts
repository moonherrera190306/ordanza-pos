import { prisma } from "./db";
import { n, r2 } from "./format";

export type ResumenTurno = {
  id: string; caja: string; abiertoPor: string; abiertoEn: string; fondo: number;
  tickets: number; cancelados: number;
  /** Ventas por forma de pago (montos aplicados) */
  porMetodo: { EFECTIVO: number; TARJETA: number; TRANSFERENCIA: number; CREDITO: number };
  total: number;
  abonosEfectivo: number; entradas: number; retiros: number; devolucionesEfectivo: number;
  esperado: number;
};

/** Cuadre de un turno: todo lo que movió efectivo en esa caja. */
export async function calcResumen(turnoId: string, tid: string): Promise<ResumenTurno> {
  const t = await prisma.turno.findFirstOrThrow({ where: { id: turnoId, tenantId: tid }, include: { caja: { select: { nombre: true } } } });
  const [pagos, conteo, abonos, caja, devs] = await Promise.all([
    prisma.ventaPago.groupBy({ by: ["metodo"], where: { venta: { tenantId: tid, turnoId, estado: "PAGADA" } }, _sum: { monto: true } }),
    prisma.venta.groupBy({ by: ["estado"], where: { tenantId: tid, turnoId }, _count: true }),
    prisma.movCliente.aggregate({ where: { tenantId: tid, turnoId, tipo: "ABONO", metodo: "EFECTIVO" }, _sum: { monto: true } }),
    prisma.movCaja.groupBy({ by: ["tipo"], where: { tenantId: tid, turnoId }, _sum: { monto: true } }),
    prisma.devolucion.aggregate({ where: { tenantId: tid, turnoId, metodo: "EFECTIVO" }, _sum: { total: true } }),
  ]);
  const porMetodo = { EFECTIVO: 0, TARJETA: 0, TRANSFERENCIA: 0, CREDITO: 0 };
  for (const p of pagos) porMetodo[p.metodo] = r2(n(p._sum.monto));
  const tickets = conteo.find((c) => c.estado === "PAGADA")?._count ?? 0;
  const cancelados = conteo.find((c) => c.estado === "CANCELADA")?._count ?? 0;
  const entradas = r2(n(caja.find((c) => c.tipo === "ENTRADA")?._sum.monto));
  const retiros = r2(n(caja.find((c) => c.tipo === "RETIRO")?._sum.monto));
  const abonosEfectivo = r2(n(abonos._sum.monto));
  const devolucionesEfectivo = r2(n(devs._sum.total));
  const total = r2(Object.values(porMetodo).reduce((a, b) => a + b, 0));
  return {
    id: t.id, caja: t.caja.nombre, abiertoPor: t.abiertoPor, abiertoEn: t.abiertoEn.toISOString(), fondo: n(t.fondo),
    tickets, cancelados, porMetodo, total, abonosEfectivo, entradas, retiros, devolucionesEfectivo,
    esperado: r2(n(t.fondo) + porMetodo.EFECTIVO + abonosEfectivo + entradas - retiros - devolucionesEfectivo),
  };
}
