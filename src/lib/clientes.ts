import { prisma } from "./db";
import { n, r2 } from "./format";
import type { Prisma } from "@/generated/prisma/client";

type Db = typeof prisma | Prisma.TransactionClient;

/** Saldo por cliente = cargos − abonos. */
export async function saldoMap(tid: string, ids?: string[], db: Db = prisma) {
  const g = await db.movCliente.groupBy({
    by: ["clienteId", "tipo"],
    where: { tenantId: tid, ...(ids ? { clienteId: { in: ids } } : {}) },
    _sum: { monto: true },
  });
  const m = new Map<string, number>();
  for (const r of g) m.set(r.clienteId, r2((m.get(r.clienteId) ?? 0) + (r.tipo === "CARGO" ? 1 : -1) * n(r._sum.monto)));
  return m;
}

export type ClienteDTO = { id: string; nombre: string; telefono: string | null; limite: number; saldo: number };

export async function clientesDTO(tid: string): Promise<ClienteDTO[]> {
  const [cs, sm] = await Promise.all([
    prisma.cliente.findMany({ where: { tenantId: tid, activo: true }, orderBy: { nombre: "asc" }, select: { id: true, nombre: true, telefono: true, limiteCredito: true } }),
    saldoMap(tid),
  ]);
  return cs.map((c) => ({ id: c.id, nombre: c.nombre, telefono: c.telefono, limite: n(c.limiteCredito), saldo: sm.get(c.id) ?? 0 }));
}
