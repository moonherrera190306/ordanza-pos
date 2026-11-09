"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { requireAction } from "@/lib/auth";
import { bitacora } from "@/lib/log";
import { run, UserError } from "@/lib/action";
import { METODOS, money, n, r2, r3 } from "@/lib/format";
import { adminPorPin, autorizar } from "@/lib/supervisor";
import { calcResumen, type ResumenTurno } from "@/lib/corte";
import { saldoMap } from "@/lib/clientes";
import { estadoLicencia } from "@/lib/licencia";

function exigirLicencia(s: { tenant: { licenciaClave: string | null; creado: Date } }) {
  if (estadoLicencia(s.tenant).modo === "vencida")
    throw new UserError("Terminó la prueba de 15 días. Activa tu licencia en Ajustes para seguir vendiendo.");
}

async function turnoAbierto(tid: string, cajaId: string) {
  return prisma.turno.findFirst({ where: { tenantId: tid, cajaId, estado: "ABIERTO" } });
}

export async function abrirTurno(fondo: number) {
  return run(async () => {
    const s = await requireAction(["ADMIN", "CAJERO"]);
    exigirLicencia(s);
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

/** Valida el PIN de un administrador desde el punto de venta (para mostrar quién autoriza). */
export async function verificarSupervisor(pin: string) {
  return run<string>(async () => {
    const s = await requireAction(["ADMIN", "CAJERO"]);
    const quien = await adminPorPin(s.tid, pin);
    if (!quien) {
      await bitacora(s, "Seguridad", "PIN de supervisor incorrecto", "verificación");
      throw new UserError("PIN de supervisor incorrecto.");
    }
    return quien;
  });
}

const Metodo = z.enum(["EFECTIVO", "TARJETA", "TRANSFERENCIA", "CREDITO"]);
const Cobro = z.object({
  clientId: z.string().min(8).max(64),
  items: z.array(z.object({ id: z.string(), cant: z.number().positive().max(100000) })).min(1).max(300),
  desc: z.object({ type: z.enum(["%", "$"]), value: z.number().min(0) }),
  /** EFECTIVO = lo que entregó el cliente (con cambio); los demás, el monto aplicado. */
  pagos: z.array(z.object({ metodo: Metodo, monto: z.number().min(0).max(10_000_000) })).min(1).max(6),
  clienteId: z.string().optional(),
  cliente: z.string().max(120).optional(),
  autPin: z.string().max(6).optional(),
});

export type CobroInput = z.infer<typeof Cobro>;
export type VentaHecha = { id: string; folio: string; total: number; cambio: number; metodo: string; pagos: { metodo: string; monto: number }[] };

/** Registra una venta. Los precios salen de la BD, nunca del cliente. Idempotente por clientId. */
export async function cobrar(input: CobroInput) {
  return run<VentaHecha>(async () => {
    const s = await requireAction(["ADMIN", "CAJERO"]);
    exigirLicencia(s);
    const d = Cobro.parse(input);
    if (!s.caja) throw new UserError("Tu sesión no tiene caja asignada.");

    const prev = await prisma.venta.findUnique({ where: { clientId: d.clientId }, include: { pagos: true } });
    if (prev) return hecha(prev);

    const autorizo = d.desc.value > 0 ? await autorizar(s, "descuento", d.autPin) : null;

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

      // Formas de pago
      const sumBy = (m: string) => r2(d.pagos.filter((p) => p.metodo === m).reduce((a, p) => a + p.monto, 0));
      const aplicado = { TARJETA: sumBy("TARJETA"), TRANSFERENCIA: sumBy("TRANSFERENCIA"), CREDITO: sumBy("CREDITO") };
      const noEfectivo = r2(aplicado.TARJETA + aplicado.TRANSFERENCIA + aplicado.CREDITO);
      if (noEfectivo > total + 0.001) throw new UserError("Los pagos con tarjeta, transferencia o crédito no pueden pasar del total.");
      const efectivoRecibido = sumBy("EFECTIVO");
      const efectivoAplicado = r2(total - noEfectivo);
      if (efectivoRecibido + 0.001 < efectivoAplicado) throw new UserError(`Faltan ${money(efectivoAplicado - efectivoRecibido)} para completar el pago.`);
      const cambio = efectivoAplicado > 0 ? r2(efectivoRecibido - efectivoAplicado) : 0;
      if (efectivoAplicado <= 0 && efectivoRecibido > 0) throw new UserError("Ya se cubrió el total sin efectivo; quita el efectivo.");

      let cliente: { id: string; nombre: string } | null = null;
      if (d.clienteId) {
        await tx.$queryRaw`SELECT id FROM "Cliente" WHERE id = ${d.clienteId} FOR UPDATE`;
        const c = await tx.cliente.findFirst({ where: { id: d.clienteId, tenantId: s.tid, activo: true } });
        if (!c) throw new UserError("No encontré al cliente.");
        cliente = { id: c.id, nombre: c.nombre };
        if (aplicado.CREDITO > 0) {
          const lim = n(c.limiteCredito);
          if (lim <= 0) throw new UserError(`${c.nombre} no tiene crédito autorizado.`);
          const saldo = (await saldoMap(s.tid, [c.id], tx)).get(c.id) ?? 0;
          if (saldo + aplicado.CREDITO > lim + 0.001)
            throw new UserError(`Crédito insuficiente: debe ${money(saldo)} de un límite de ${money(lim)}. Disponible ${money(Math.max(0, lim - saldo))}.`);
        }
      } else if (aplicado.CREDITO > 0) throw new UserError("Para vender a crédito elige un cliente.");

      const pagos = (
        [["EFECTIVO", efectivoAplicado], ["TARJETA", aplicado.TARJETA], ["TRANSFERENCIA", aplicado.TRANSFERENCIA], ["CREDITO", aplicado.CREDITO]] as const
      ).filter(([, m]) => m > 0).map(([metodo, monto]) => ({ metodo, monto }));
      if (!pagos.length) pagos.push({ metodo: "EFECTIVO", monto: 0 }); // venta en $0
      const principal = pagos.reduce((a, p) => (p.monto > a.monto ? p : a)).metodo;

      const caja = await tx.caja.update({ where: { id: s.caja!.id }, data: { consecutivo: { increment: 1 } } });
      const folio = `${caja.clave}-${String(caja.consecutivo).padStart(6, "0")}`;

      const venta = await tx.venta.create({
        data: {
          tenantId: s.tid, folio, clientId: d.clientId, cajaId: caja.id, turnoId: turno.id,
          usuarioId: s.user.id, usuarioNombre: s.user.nombre,
          clienteId: cliente?.id ?? null, cliente: cliente?.nombre ?? (d.cliente?.trim() || null), autorizadoPor: autorizo,
          subtotal, descuento, iva, total, costo, metodo: principal,
          recibido: r2(efectivoRecibido + noEfectivo), cambio,
          items: {
            create: lines.map((l) => ({
              productoId: l.p.id, nombre: l.p.nombre, unidad: l.p.unidad, precio: l.precio, costo: l.costo, cantidad: l.cant, importe: l.importe,
            })),
          },
          pagos: { create: pagos },
        },
        include: { pagos: true },
      });
      const movs = lines.filter((l) => !l.p.esServicio);
      if (movs.length)
        await tx.movimiento.createMany({
          data: movs.map((l) => ({
            tenantId: s.tid, productoId: l.p.id, tipo: "VENTA" as const, cantidad: -l.cant, costoUnit: l.costo,
            nota: folio, usuarioId: s.user.id, usuarioNombre: s.user.nombre, ventaId: venta.id,
          })),
        });
      if (cliente && aplicado.CREDITO > 0)
        await tx.movCliente.create({
          data: {
            tenantId: s.tid, clienteId: cliente.id, tipo: "CARGO", monto: aplicado.CREDITO, ventaId: venta.id, turnoId: turno.id,
            nota: `Venta ${folio}`, usuarioId: s.user.id, usuarioNombre: s.user.nombre,
          },
        });
      return venta;
    });

    if (autorizo) await bitacora(s, "Ventas", "Descuento autorizado", `${v.folio} · ${money(v.descuento)} · autorizó ${autorizo}`);
    revalidatePath("/", "layout");
    return hecha(v);
  });
}

function hecha(v: { id: string; folio: string; total: unknown; cambio: unknown; metodo: string; pagos: { metodo: string; monto: unknown }[] }): VentaHecha {
  return { id: v.id, folio: v.folio, total: n(v.total), cambio: n(v.cambio), metodo: v.metodo, pagos: v.pagos.map((p) => ({ metodo: p.metodo, monto: n(p.monto) })) };
}

export async function resumenTurno() {
  return run<ResumenTurno>(async () => {
    const s = await requireAction(["ADMIN", "CAJERO"]);
    if (!s.caja) throw new UserError("Tu sesión no tiene caja asignada.");
    const t = await turnoAbierto(s.tid, s.caja.id);
    if (!t) throw new UserError("La caja ya está cerrada.");
    return calcResumen(t.id, s.tid);
  });
}

export async function cerrarTurno(contado: number, nota: string) {
  return run<string>(async () => {
    const s = await requireAction(["ADMIN", "CAJERO"]);
    if (!s.caja) throw new UserError("Tu sesión no tiene caja asignada.");
    const t = await turnoAbierto(s.tid, s.caja.id);
    if (!t) throw new UserError("La caja ya está cerrada.");
    const r = await calcResumen(t.id, s.tid);
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
    // Sin revalidar aquí: la pantalla de "Caja cerrada" (con el botón de imprimir) debe seguir visible.
    // El POS refresca al cerrar ese aviso.
    return t.id;
  }, "Caja cerrada");
}

const MovCajaIn = z.object({
  tipo: z.enum(["ENTRADA", "RETIRO"]),
  monto: z.number().positive("Escribe un monto mayor a cero.").max(10_000_000),
  concepto: z.string().trim().min(2, "Escribe el concepto.").max(160),
  autPin: z.string().max(6).optional(),
});

/** Entrada o retiro de efectivo del turno abierto (gastos, pago a proveedor, retiro a caja fuerte). */
export async function movimientoCaja(input: z.input<typeof MovCajaIn>) {
  return run(async () => {
    const s = await requireAction(["ADMIN", "CAJERO"]);
    const d = MovCajaIn.parse(input);
    if (!s.caja) throw new UserError("Tu sesión no tiene caja asignada.");
    const t = await turnoAbierto(s.tid, s.caja.id);
    if (!t) throw new UserError("La caja está cerrada.");
    const autorizo = d.tipo === "RETIRO" ? await autorizar(s, "retiro", d.autPin) : null;
    if (d.tipo === "RETIRO") {
      const r = await calcResumen(t.id, s.tid);
      if (d.monto > r.esperado + 0.001) throw new UserError(`En caja debería haber ${money(r.esperado)}; no alcanza para retirar ${money(d.monto)}.`);
    }
    await prisma.movCaja.create({
      data: { tenantId: s.tid, turnoId: t.id, tipo: d.tipo, monto: r2(d.monto), concepto: d.concepto, usuarioId: s.user.id, usuarioNombre: s.user.nombre, autorizadoPor: autorizo },
    });
    await bitacora(s, "Caja", d.tipo === "ENTRADA" ? "Entrada de efectivo" : "Retiro de efectivo", `${s.caja.nombre} · ${money(d.monto)} · ${d.concepto}${autorizo ? ` · autorizó ${autorizo}` : ""}`);
    revalidatePath("/venta");
  }, input.tipo === "ENTRADA" ? "Entrada registrada" : "Retiro registrado");
}

export type VentaParaDevolver = {
  id: string; folio: string; fecha: string; cliente: string | null; clienteId: string | null; total: number; factor: number;
  pagos: { metodo: string; monto: number }[];
  items: { id: string; nombre: string; unidad: string; precio: number; cantidad: number; devuelto: number; disponible: number }[];
};

export async function buscarVentaParaDevolver(folio: string) {
  return run<VentaParaDevolver>(async () => {
    const s = await requireAction(["ADMIN", "CAJERO"]);
    const f = folio.trim().toUpperCase();
    if (!f) throw new UserError("Escribe o escanea el folio del ticket.");
    const v = await prisma.venta.findFirst({ where: { tenantId: s.tid, folio: f }, include: { items: true, pagos: true } });
    if (!v) throw new UserError(`No encontré el ticket ${f}.`);
    if (v.estado === "CANCELADA") throw new UserError("Ese ticket está cancelado.");
    const sub = n(v.subtotal);
    return {
      id: v.id, folio: v.folio, fecha: v.creado.toISOString(), cliente: v.cliente, clienteId: v.clienteId, total: n(v.total),
      factor: sub > 0 ? n(v.total) / sub : 1,
      pagos: v.pagos.map((p) => ({ metodo: p.metodo, monto: n(p.monto) })),
      items: v.items.map((i) => ({
        id: i.id, nombre: i.nombre, unidad: i.unidad, precio: n(i.precio), cantidad: n(i.cantidad), devuelto: n(i.devuelto),
        disponible: r3(n(i.cantidad) - n(i.devuelto)),
      })),
    };
  });
}

const DevIn = z.object({
  ventaId: z.string(),
  items: z.array(z.object({ ventaItemId: z.string(), cant: z.number().positive() })).min(1, "Elige qué se devuelve."),
  metodo: Metodo,
  motivo: z.string().trim().min(2, "Escribe el motivo.").max(200),
  autPin: z.string().max(6).optional(),
});

/** Devolución parcial o total: regresa existencia y el dinero (efectivo de la caja, tarjeta, transferencia o abono a la cuenta). */
export async function devolver(input: z.input<typeof DevIn>) {
  return run<{ id: string; total: number }>(async () => {
    const s = await requireAction(["ADMIN", "CAJERO"]);
    const d = DevIn.parse(input);
    const autorizo = await autorizar(s, "devolucion", d.autPin);
    const turno = s.caja ? await turnoAbierto(s.tid, s.caja.id) : null;
    if (d.metodo === "EFECTIVO" && !turno) throw new UserError("Para devolver efectivo necesitas una caja abierta.");

    const r = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Venta" WHERE id = ${d.ventaId} FOR UPDATE`;
      const v = await tx.venta.findFirst({ where: { id: d.ventaId, tenantId: s.tid }, include: { items: { include: { producto: { select: { esServicio: true } } } } } });
      if (!v) throw new UserError("No encontré la venta.");
      if (v.estado === "CANCELADA") throw new UserError("La venta está cancelada.");
      if (d.metodo === "CREDITO" && !v.clienteId) throw new UserError("Esta venta no tiene cliente; elige otra forma de reembolso.");
      const factor = n(v.subtotal) > 0 ? n(v.total) / n(v.subtotal) : 1;
      const lines = d.items.map((it) => {
        const vi = v.items.find((x) => x.id === it.ventaItemId);
        if (!vi) throw new UserError("Un artículo no pertenece a esta venta.");
        const disp = r3(n(vi.cantidad) - n(vi.devuelto));
        const cant = r3(it.cant);
        if (cant > disp + 0.0005) throw new UserError(`De "${vi.nombre}" solo quedan ${disp} por devolver.`);
        return { vi, cant, importe: r2(n(vi.precio) * cant * factor) };
      });
      const total = r2(lines.reduce((a, l) => a + l.importe, 0));
      if (d.metodo === "EFECTIVO") {
        const res = await calcResumen(turno!.id, s.tid);
        if (total > res.esperado + 0.001) throw new UserError(`En caja debería haber ${money(res.esperado)}; no alcanza para devolver ${money(total)}.`);
      }
      const dev = await tx.devolucion.create({
        data: {
          tenantId: s.tid, ventaId: v.id, turnoId: turno?.id ?? null, total, metodo: d.metodo, motivo: d.motivo,
          usuarioId: s.user.id, usuarioNombre: s.user.nombre, autorizadoPor: autorizo,
          items: { create: lines.map((l) => ({ ventaItemId: l.vi.id, productoId: l.vi.productoId, nombre: l.vi.nombre, cantidad: l.cant, importe: l.importe })) },
        },
      });
      for (const l of lines) await tx.ventaItem.update({ where: { id: l.vi.id }, data: { devuelto: { increment: l.cant } } });
      const back = lines.filter((l) => !l.vi.producto.esServicio);
      if (back.length)
        await tx.movimiento.createMany({
          data: back.map((l) => ({
            tenantId: s.tid, productoId: l.vi.productoId, tipo: "DEVOLUCION" as const, cantidad: l.cant, costoUnit: l.vi.costo,
            nota: `${v.folio} · ${d.motivo}`, usuarioId: s.user.id, usuarioNombre: s.user.nombre, ventaId: v.id, devolucionId: dev.id,
          })),
        });
      if (d.metodo === "CREDITO")
        await tx.movCliente.create({
          data: { tenantId: s.tid, clienteId: v.clienteId!, tipo: "ABONO", monto: total, ventaId: v.id, nota: `Devolución ${v.folio}`, usuarioId: s.user.id, usuarioNombre: s.user.nombre },
        });
      return { id: dev.id, total, folio: v.folio };
    });
    await bitacora(s, "Ventas", "Devolución", `${r.folio} · ${money(r.total)} · ${METODOS[d.metodo]} · ${d.motivo}${autorizo ? ` · autorizó ${autorizo}` : ""}`);
    revalidatePath("/", "layout");
    return { id: r.id, total: r.total };
  }, "Devolución registrada");
}

export async function cancelarVenta(id: string, motivo: string) {
  return run(async () => {
    const s = await requireAction(["ADMIN"]);
    const m = motivo.trim();
    if (!m) throw new UserError("Escribe el motivo de la cancelación.");
    const v = await prisma.$transaction(async (tx) => {
      const v = await tx.venta.findFirst({
        where: { id, tenantId: s.tid },
        include: { items: { include: { producto: { select: { esServicio: true } } } }, pagos: true, _count: { select: { devoluciones: true } } },
      });
      if (!v) throw new UserError("No encontré la venta.");
      if (v.estado === "CANCELADA") throw new UserError("La venta ya estaba cancelada.");
      if (v._count.devoluciones) throw new UserError("Esta venta ya tiene devoluciones. Registra una devolución por lo que queda.");
      await tx.venta.update({ where: { id }, data: { estado: "CANCELADA", canceladaPor: s.user.nombre, canceladaEn: new Date(), motivoCancelacion: m } });
      const back = v.items.filter((i) => !i.producto.esServicio);
      if (back.length)
        await tx.movimiento.createMany({
          data: back.map((i) => ({
            tenantId: s.tid, productoId: i.productoId, tipo: "CANCELACION" as const, cantidad: i.cantidad, costoUnit: i.costo,
            nota: `${v.folio} · ${m}`, usuarioId: s.user.id, usuarioNombre: s.user.nombre, ventaId: v.id,
          })),
        });
      const credito = v.pagos.filter((p) => p.metodo === "CREDITO").reduce((a, p) => a + n(p.monto), 0);
      if (v.clienteId && credito > 0)
        await tx.movCliente.create({
          data: { tenantId: s.tid, clienteId: v.clienteId, tipo: "ABONO", monto: r2(credito), ventaId: v.id, nota: `Cancelación ${v.folio}`, usuarioId: s.user.id, usuarioNombre: s.user.nombre },
        });
      return v;
    });
    await bitacora(s, "Ventas", "Cancelación de venta", `${v.folio} · ${money(v.total)} · ${m}`);
    revalidatePath("/", "layout");
  }, "Venta cancelada");
}
