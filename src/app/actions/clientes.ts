"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAction } from "@/lib/auth";
import { bitacora } from "@/lib/log";
import { run, UserError } from "@/lib/action";
import { METODOS, money, r2 } from "@/lib/format";
import { saldoMap, type ClienteDTO } from "@/lib/clientes";

const ClienteIn = z.object({
  id: z.string().optional(),
  nombre: z.string().trim().min(2, "Escribe el nombre del cliente.").max(120),
  telefono: z.string().trim().max(40).optional(),
  email: z.string().trim().max(120).optional(),
  rfc: z.string().trim().max(13).optional(),
  limiteCredito: z.number().min(0).max(10_000_000),
  nota: z.string().trim().max(300).optional(),
  activo: z.boolean().default(true),
});

export async function guardarCliente(input: z.input<typeof ClienteIn>) {
  return run<string>(async () => {
    const s = await requireAction(["ADMIN", "CAJERO"]);
    const d = ClienteIn.parse(input);
    const prev = d.id ? await prisma.cliente.findFirst({ where: { id: d.id, tenantId: s.tid } }) : null;
    if (d.id && !prev) throw new UserError("No encontré al cliente.");
    // Solo un administrador da o cambia crédito.
    const limite = s.user.rol === "ADMIN" ? r2(d.limiteCredito) : prev ? Number(prev.limiteCredito) : 0;
    if (s.user.rol !== "ADMIN" && d.limiteCredito > 0 && (!prev || d.limiteCredito !== Number(prev.limiteCredito)))
      throw new UserError("Solo un administrador puede dar o cambiar crédito.");
    const data = {
      nombre: d.nombre, telefono: d.telefono || null, email: d.email || null, rfc: d.rfc?.toUpperCase() || null,
      limiteCredito: limite, nota: d.nota || null, activo: d.activo,
    };
    const c = prev
      ? await prisma.cliente.update({ where: { id: prev.id }, data })
      : await prisma.cliente.create({ data: { ...data, tenantId: s.tid } });
    await bitacora(s, "Clientes", prev ? "Edición de cliente" : "Alta de cliente", `${d.nombre}${limite ? ` · límite ${money(limite)}` : ""}`);
    revalidatePath("/clientes");
    return c.id;
  }, "Cliente guardado");
}

/** Alta rápida desde el punto de venta (sin crédito). */
export async function crearClienteRapido(nombre: string, telefono?: string) {
  return run<ClienteDTO>(async () => {
    const s = await requireAction(["ADMIN", "CAJERO"]);
    const nm = nombre.trim();
    if (nm.length < 2) throw new UserError("Escribe el nombre del cliente.");
    const c = await prisma.cliente.create({ data: { tenantId: s.tid, nombre: nm.slice(0, 120), telefono: telefono?.trim() || null } });
    await bitacora(s, "Clientes", "Alta de cliente", nm);
    return { id: c.id, nombre: c.nombre, telefono: c.telefono, limite: 0, saldo: 0 };
  }, "Cliente agregado");
}

const AbonoIn = z.object({
  clienteId: z.string(),
  monto: z.number().positive("Escribe un monto mayor a cero."),
  metodo: z.enum(["EFECTIVO", "TARJETA", "TRANSFERENCIA"]),
  nota: z.string().trim().max(200).optional(),
});

/** Pago a la cuenta del cliente. En efectivo entra a la caja abierta y cuenta en el corte. */
export async function abonar(input: z.input<typeof AbonoIn>) {
  return run(async () => {
    const s = await requireAction(["ADMIN", "CAJERO"]);
    const d = AbonoIn.parse(input);
    const turno = s.caja ? await prisma.turno.findFirst({ where: { tenantId: s.tid, cajaId: s.caja.id, estado: "ABIERTO" } }) : null;
    if (d.metodo === "EFECTIVO" && !turno) throw new UserError("Para recibir efectivo abre la caja primero (en Vender).");
    const c = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Cliente" WHERE id = ${d.clienteId} FOR UPDATE`;
      const c = await tx.cliente.findFirst({ where: { id: d.clienteId, tenantId: s.tid } });
      if (!c) throw new UserError("No encontré al cliente.");
      const saldo = (await saldoMap(s.tid, [c.id], tx)).get(c.id) ?? 0;
      if (saldo <= 0) throw new UserError(`${c.nombre} no tiene saldo pendiente.`);
      if (d.monto > saldo + 0.001) throw new UserError(`El abono pasa del saldo (${money(saldo)}).`);
      await tx.movCliente.create({
        data: {
          tenantId: s.tid, clienteId: c.id, tipo: "ABONO", monto: r2(d.monto), metodo: d.metodo, turnoId: turno?.id ?? null,
          nota: d.nota || "Abono", usuarioId: s.user.id, usuarioNombre: s.user.nombre,
        },
      });
      return c;
    });
    await bitacora(s, "Clientes", "Abono", `${c.nombre} · ${money(d.monto)} · ${METODOS[d.metodo]}`);
    revalidatePath("/clientes");
    revalidatePath("/venta");
  }, "Abono registrado");
}
