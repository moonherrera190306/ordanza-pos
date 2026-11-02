"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { requireAction } from "@/lib/auth";
import { bitacora } from "@/lib/log";
import { run, UserError } from "@/lib/action";
import { money, n, r2, r3 } from "@/lib/format";
import { calcResumen } from "@/lib/corte";

const ProvIn = z.object({
  id: z.string().optional(),
  nombre: z.string().trim().min(2, "Escribe el nombre del proveedor.").max(120),
  contacto: z.string().trim().max(120).optional(),
  telefono: z.string().trim().max(40).optional(),
  email: z.string().trim().max(120).optional(),
  rfc: z.string().trim().max(13).optional(),
  nota: z.string().trim().max(300).optional(),
  activo: z.boolean().default(true),
});

export async function guardarProveedor(input: z.input<typeof ProvIn>) {
  return run<{ id: string; nombre: string }>(async () => {
    const s = await requireAction(["ADMIN", "ALMACEN"]);
    const d = ProvIn.parse(input);
    const data = { nombre: d.nombre, contacto: d.contacto || null, telefono: d.telefono || null, email: d.email || null, rfc: d.rfc?.toUpperCase() || null, nota: d.nota || null, activo: d.activo };
    let p;
    if (d.id) {
      const r = await prisma.proveedor.updateMany({ where: { id: d.id, tenantId: s.tid }, data });
      if (!r.count) throw new UserError("No encontré el proveedor.");
      p = { id: d.id, nombre: d.nombre };
    } else p = await prisma.proveedor.create({ data: { ...data, tenantId: s.tid }, select: { id: true, nombre: true } });
    await bitacora(s, "Compras", d.id ? "Edición de proveedor" : "Alta de proveedor", d.nombre);
    revalidatePath("/compras");
    return p;
  }, "Proveedor guardado");
}

const CompraIn = z.object({
  proveedorId: z.string().optional(),
  factura: z.string().trim().max(60).optional(),
  nota: z.string().trim().max(300).optional(),
  items: z.array(z.object({ productoId: z.string(), cant: z.number().positive().max(1_000_000), costo: z.number().min(0).max(10_000_000) })).min(1, "Agrega al menos un producto.").max(500),
  actualizarCosto: z.boolean().default(true),
  pagarDeCaja: z.boolean().default(false),
});

/** Recepción de mercancía: entra existencia, se actualiza el costo (promedio) y, si se pide, sale el efectivo de la caja. */
export async function registrarCompra(input: z.input<typeof CompraIn>) {
  return run<string>(async () => {
    const s = await requireAction(["ADMIN", "ALMACEN"]);
    const d = CompraIn.parse(input);
    const total = r2(d.items.reduce((a, i) => a + i.cant * i.costo, 0));
    let turnoId: string | null = null;
    if (d.pagarDeCaja) {
      if (!s.caja) throw new UserError("Tu sesión no tiene caja para pagar en efectivo.");
      const t = await prisma.turno.findFirst({ where: { tenantId: s.tid, cajaId: s.caja.id, estado: "ABIERTO" } });
      if (!t) throw new UserError("Abre la caja para pagar la compra con efectivo.");
      const r = await calcResumen(t.id, s.tid);
      if (total > r.esperado + 0.001) throw new UserError(`En caja debería haber ${money(r.esperado)}; no alcanza para pagar ${money(total)}.`);
      turnoId = t.id;
    }
    const ids = [...new Set(d.items.map((i) => i.productoId))];
    const c = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Producto" WHERE "tenantId" = ${s.tid} AND id IN (${Prisma.join(ids)}) FOR UPDATE`;
      const prods = await tx.producto.findMany({ where: { tenantId: s.tid, id: { in: ids } } });
      if (prods.length !== ids.length) throw new UserError("Un producto de la compra ya no existe.");
      const pm = new Map(prods.map((p) => [p.id, p]));
      if (prods.some((p) => p.esServicio)) throw new UserError("Los servicios no llevan inventario; quítalos de la compra.");
      const prov = d.proveedorId ? await tx.proveedor.findFirst({ where: { id: d.proveedorId, tenantId: s.tid } }) : null;
      if (d.proveedorId && !prov) throw new UserError("No encontré el proveedor.");

      const compra = await tx.compra.create({
        data: {
          tenantId: s.tid, proveedorId: prov?.id ?? null, factura: d.factura || null, nota: d.nota || null, total, pagadoDeCaja: d.pagarDeCaja,
          usuarioId: s.user.id, usuarioNombre: s.user.nombre,
          items: { create: d.items.map((i) => ({ productoId: i.productoId, nombre: pm.get(i.productoId)!.nombre, cantidad: r3(i.cant), costo: r2(i.costo), importe: r2(i.cant * i.costo) })) },
        },
      });
      const st = await tx.movimiento.groupBy({ by: ["productoId"], where: { tenantId: s.tid, productoId: { in: ids } }, _sum: { cantidad: true } });
      const sm = new Map(st.map((r) => [r.productoId, n(r._sum.cantidad)]));
      const nota = `Compra${prov ? " a " + prov.nombre : ""}${d.factura ? " · " + d.factura : ""}`;
      for (const i of d.items) {
        await tx.movimiento.create({
          data: { tenantId: s.tid, productoId: i.productoId, tipo: "COMPRA", cantidad: r3(i.cant), costoUnit: r2(i.costo), nota, usuarioId: s.user.id, usuarioNombre: s.user.nombre, compraId: compra.id },
        });
        if (d.actualizarCosto) {
          const p = pm.get(i.productoId)!;
          const antes = Math.max(0, sm.get(p.id) ?? 0);
          const nuevo = antes + i.cant > 0 ? r2((antes * n(p.costo) + i.cant * i.costo) / (antes + i.cant)) : r2(i.costo);
          await tx.producto.update({ where: { id: p.id }, data: { costo: nuevo } });
          sm.set(p.id, antes + i.cant);
          p.costo = new Prisma.Decimal(nuevo);
        }
      }
      if (turnoId)
        await tx.movCaja.create({
          data: { tenantId: s.tid, turnoId, tipo: "RETIRO", monto: total, concepto: nota, compraId: compra.id, usuarioId: s.user.id, usuarioNombre: s.user.nombre },
        });
      return { compra, prov };
    });
    await bitacora(s, "Compras", "Compra registrada", `${c.prov?.nombre ?? "Sin proveedor"}${d.factura ? " · " + d.factura : ""} · ${d.items.length} productos · ${money(total)}${d.pagarDeCaja ? " · pagada de caja" : ""}`);
    revalidatePath("/", "layout");
    return c.compra.id;
  }, "Compra registrada; la existencia ya se actualizó");
}
