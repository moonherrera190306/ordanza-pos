"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { requireAction } from "@/lib/auth";
import { bitacora } from "@/lib/log";
import { run, UserError } from "@/lib/action";
import { money, n, r2, r3 } from "@/lib/format";

async function turnoAbierto(tid: string, cajaId: string) {
  return prisma.turno.findFirst({ where: { tenantId: tid, cajaId, estado: "ABIERTO" } });
}

export async function abrirTurno(fondo: number) {
  return run(async () => {
    const s = await requireAction(["ADMIN", "CAJERO"]);
    if (!s.caja) throw new UserError("Tu sesión no tiene caja asignada.");
    const f = r2(Math.max(0, Number(fondo) || 0));
    const t = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Caja" WHERE id = ${s.caja!.id} FOR UPDATE`;
      const ya = await tx.turno.findFirst({ where: { tenantId: s.tid, cajaId: s.caja!.id, estado: "ABIERTO" } });
      if (ya) return ya;
      return tx.turno.create({
        data: { tenantId: s.tid, cajaId: s.caja!.id, abiertoPorId: s.user.id, abiertoPor: s.user.nombre, fondo: f },
      });
    });
    await bitacora(s, "Caja", "Apertura de caja", `${s.caja.nombre} · fondo ${money(f)}`);
    revalidatePath("/", "layout");
    return t.id;
  }, "Caja abierta");
}

const Cobro = z.object({
  clientId: z.string().min(8).max(64),
  items: z.array(z.object({ id: z.string(), cant: z.number().positive().max(100000) })).min(1).max(300),
  desc: z.object({ type: z.enum(["%", "$"]), value: z.number().min(0) }),
  metodo: z.enum(["EFECTIVO", "TARJETA", "TRANSFERENCIA"]),
  recibido: z.number().min(0),
  cliente: z.string().max(120).optional(),
});

export type CobroInput = z.infer<typeof Cobro>;
export type VentaHecha = { id: string; folio: string; total: number; cambio: number; metodo: string };

/** Registra una venta. Los precios salen de la BD, nunca del cliente. Idempotente por clientId. */
export async function cobrar(input: CobroInput) {
  return run<VentaHecha>(async () => {
    const s = await requireAction(["ADMIN", "CAJERO"]);
    const d = Cobro.parse(input);
    if (!s.caja) throw new UserError("Tu sesión no tiene caja asignada.");

    const prev = await prisma.venta.findUnique({ where: { clientId: d.clientId } });
    if (prev) return { id: prev.id, folio: prev.folio, total: n(prev.total), cambio: n(prev.cambio), metodo: prev.metodo };

    // Une renglones repetidos del mismo producto.
    const qty = new Map<string, number>();
    for (const it of d.items) qty.set(it.id, r3((qty.get(it.id) ?? 0) + it.cant));
    const ids = [...qty.keys()];

    const v = await prisma.$transaction(async (tx) => {
      const turno = await tx.turno.findFirst({ where: { tenantId: s.tid, cajaId: s.caja!.id, estado: "ABIERTO" } });
      if (!turno) throw new UserError("La caja está cerrada. Ábrela para vender.");

      // Bloquea los productos para que dos cajas no vendan la última pieza al mismo tiempo.
      await tx.$queryRaw`SELECT id FROM "Producto" WHERE "tenantId" = ${s.tid} AND id IN (${Prisma.join(ids)}) FOR UPDATE`;
      const prods = await tx.producto.findMany({ where: { tenantId: s.tid, id: { in: ids }, activo: true } });
      if (prods.length !== ids.length) throw new UserError("Un producto del ticket ya no está disponible. Revisa el ticket.");

      if (!s.tenant.permitirSinStock) {
        const st = await tx.movimiento.groupBy({ by: ["productoId"], where: { tenantId: s.tid, productoId: { in: ids } }, _sum: { cantidad: true } });
        const sm = new Map(st.map((r) => [r.productoId, n(r._sum.cantidad)]));
        for (const p of prods) {
          if (p.esServicio) continue;
          const have = r3(sm.get(p.id) ?? 0);
          if (qty.get(p.id)! > have) throw new UserError(`No hay suficiente "${p.nombre}" (quedan ${have}).`);
        }
      }

      const lines = prods.map((p) => {
        const cant = qty.get(p.id)!;
        return { p, cant, precio: n(p.precio), costo: n(p.costo), importe: r2(n(p.precio) * cant) };
      });
      const subtotal = r2(lines.reduce((a, l) => a + l.importe, 0));
      const descuento = r2(d.desc.type === "%" ? (subtotal * Math.min(100, d.desc.value)) / 100 : Math.min(subtotal, d.desc.value));
      const total = r2(subtotal - descuento);
      const ivaPct = n(s.tenant.ivaPct);
      const iva = r2(total - total / (1 + ivaPct / 100));
      const costo = r2(lines.reduce((a, l) => a + l.costo * l.cant, 0));
      const recibido = d.metodo === "EFECTIVO" ? r2(d.recibido) : total;
      if (recibido < total) throw new UserError("El monto recibido es menor al total.");

      const caja = await tx.caja.update({ where: { id: s.caja!.id }, data: { consecutivo: { increment: 1 } } });
      const folio = `${caja.clave}-${String(caja.consecutivo).padStart(6, "0")}`;

      const venta = await tx.venta.create({
        data: {
          tenantId: s.tid, folio, clientId: d.clientId, cajaId: caja.id, turnoId: turno.id,
          usuarioId: s.user.id, usuarioNombre: s.user.nombre, cliente: d.cliente?.trim() || null,
          subtotal, descuento, iva, total, costo, metodo: d.metodo, recibido, cambio: r2(recibido - total),
          items: {
            create: lines.map((l) => ({
              productoId: l.p.id, nombre: l.p.nombre, unidad: l.p.unidad, precio: l.precio, costo: l.costo, cantidad: l.cant, importe: l.importe,
            })),
          },
        },
      });
      const movs = lines.filter((l) => !l.p.esServicio);
      if (movs.length)
        await tx.movimiento.createMany({
          data: movs.map((l) => ({
            tenantId: s.tid, productoId: l.p.id, tipo: "VENTA" as const, cantidad: -l.cant, costoUnit: l.costo,
            nota: folio, usuarioId: s.user.id, usuarioNombre: s.user.nombre, ventaId: venta.id,
          })),
        });
      return venta;
    });

    revalidatePath("/", "layout");
    return { id: v.id, folio: v.folio, total: n(v.total), cambio: n(v.cambio), metodo: v.metodo };
  });
}

export type ResumenTurno = {
  id: string; caja: string; abiertoPor: string; abiertoEn: string; fondo: number;
  tickets: number; cancelados: number; porMetodo: Record<string, number>; total: number; esperado: number;
};

export async function resumenTurno() {
  return run<ResumenTurno>(async () => {
    const s = await requireAction(["ADMIN", "CAJERO"]);
    if (!s.caja) throw new UserError("Tu sesión no tiene caja asignada.");
    const t = await turnoAbierto(s.tid, s.caja.id);
    if (!t) throw new UserError("La caja ya está cerrada.");
    return calcResumen(t.id, s.tid, s.caja.nombre);
  });
}

async function calcResumen(turnoId: string, tid: string, cajaNombre: string): Promise<ResumenTurno> {
  const t = await prisma.turno.findFirstOrThrow({ where: { id: turnoId, tenantId: tid } });
  const g = await prisma.venta.groupBy({ by: ["metodo", "estado"], where: { tenantId: tid, turnoId }, _sum: { total: true }, _count: true });
  const porMetodo: Record<string, number> = { EFECTIVO: 0, TARJETA: 0, TRANSFERENCIA: 0 };
  let tickets = 0, cancelados = 0;
  for (const r of g) {
    if (r.estado === "CANCELADA") { cancelados += r._count; continue; }
    porMetodo[r.metodo] = r2(n(r._sum.total));
    tickets += r._count;
  }
  const total = r2(Object.values(porMetodo).reduce((a, b) => a + b, 0));
  return {
    id: t.id, caja: cajaNombre, abiertoPor: t.abiertoPor, abiertoEn: t.abiertoEn.toISOString(), fondo: n(t.fondo),
    tickets, cancelados, porMetodo, total, esperado: r2(n(t.fondo) + porMetodo.EFECTIVO),
  };
}

export async function cerrarTurno(contado: number, nota: string) {
  return run<string>(async () => {
    const s = await requireAction(["ADMIN", "CAJERO"]);
    if (!s.caja) throw new UserError("Tu sesión no tiene caja asignada.");
    const t = await turnoAbierto(s.tid, s.caja.id);
    if (!t) throw new UserError("La caja ya está cerrada.");
    const r = await calcResumen(t.id, s.tid, s.caja.nombre);
    const c = r2(Math.max(0, Number(contado) || 0));
    const dif = r2(c - r.esperado);
    await prisma.turno.update({
      where: { id: t.id },
      data: {
        estado: "CERRADO", cerradoPorId: s.user.id, cerradoPor: s.user.nombre, cerradoEn: new Date(),
        esperado: r.esperado, contado: c, diferencia: dif, nota: nota?.trim().slice(0, 300) || null,
      },
    });
    await bitacora(s, "Caja", "Corte de caja", `${s.caja.nombre} · ventas ${money(r.total)} · diferencia ${money(dif)}`);
    revalidatePath("/", "layout");
    return t.id;
  }, "Caja cerrada");
}

export async function cancelarVenta(id: string, motivo: string) {
  return run(async () => {
    const s = await requireAction(["ADMIN"]);
    const m = motivo.trim();
    if (!m) throw new UserError("Escribe el motivo de la cancelación.");
    const v = await prisma.$transaction(async (tx) => {
      const v = await tx.venta.findFirst({ where: { id, tenantId: s.tid }, include: { items: { include: { producto: { select: { esServicio: true } } } } } });
      if (!v) throw new UserError("No encontré la venta.");
      if (v.estado === "CANCELADA") throw new UserError("La venta ya estaba cancelada.");
      await tx.venta.update({ where: { id }, data: { estado: "CANCELADA", canceladaPor: s.user.nombre, canceladaEn: new Date(), motivoCancelacion: m } });
      const back = v.items.filter((i) => !i.producto.esServicio);
      if (back.length)
        await tx.movimiento.createMany({
          data: back.map((i) => ({
            tenantId: s.tid, productoId: i.productoId, tipo: "CANCELACION" as const, cantidad: i.cantidad, costoUnit: i.costo,
            nota: `${v.folio} · ${m}`, usuarioId: s.user.id, usuarioNombre: s.user.nombre, ventaId: v.id,
          })),
        });
      return v;
    });
    await bitacora(s, "Ventas", "Cancelación de venta", `${v.folio} · ${money(v.total)} · ${m}`);
    revalidatePath("/", "layout");
  }, "Venta cancelada");
}
