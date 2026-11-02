"use server";

import { prisma } from "@/lib/db";
import { requireAction } from "@/lib/auth";
import { stockMap } from "@/lib/stock";
import { n } from "@/lib/format";

export type Hit = { kind: "producto"; id: string; nombre: string; precio: number; stock: number; esServicio: boolean; categoria: string | null; unidad: string }
  | { kind: "venta"; id: string; folio: string; total: number; creado: string };

/** Búsqueda global (paleta Ctrl K y escáner). Si q es un código exacto, lo pone primero. */
export async function buscarGlobal(q: string): Promise<Hit[]> {
  const s = await requireAction();
  q = q.trim();
  if (!q) return [];
  const ps = await prisma.producto.findMany({
    where: {
      tenantId: s.tid, activo: true,
      OR: [
        { nombre: { contains: q, mode: "insensitive" } },
        { codigo: { equals: q } },
        { sku: { equals: q, mode: "insensitive" } },
      ],
    },
    include: { categoria: { select: { nombre: true } } },
    take: 8,
  });
  ps.sort((a, b) => Number(b.codigo === q) - Number(a.codigo === q));
  const sm = await stockMap(s.tid, ps.map((p) => p.id));
  const hits: Hit[] = ps.map((p) => ({
    kind: "producto", id: p.id, nombre: p.nombre, precio: n(p.precio), stock: sm.get(p.id) ?? 0,
    esServicio: p.esServicio, categoria: p.categoria?.nombre ?? null, unidad: p.unidad,
  }));
  if (s.user.rol === "ADMIN") {
    const vs = await prisma.venta.findMany({
      where: { tenantId: s.tid, folio: { contains: q, mode: "insensitive" } },
      orderBy: { creado: "desc" }, take: 4,
    });
    hits.push(...vs.map((v) => ({ kind: "venta" as const, id: v.id, folio: v.folio, total: n(v.total), creado: v.creado.toISOString() })));
  }
  return hits;
}

/** Buscar por código exacto (lector o cámara). */
export async function porCodigo(code: string) {
  const s = await requireAction();
  const c = code.trim();
  if (!c) return null;
  const p = await prisma.producto.findFirst({
    where: { tenantId: s.tid, OR: [{ codigo: c }, { sku: { equals: c, mode: "insensitive" } }] },
    select: { id: true },
  });
  return p?.id ?? null;
}
