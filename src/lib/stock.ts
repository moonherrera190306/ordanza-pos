import { prisma } from "./db";
import { n, r3 } from "./format";

/** Existencia por producto = suma de su libro de movimientos. */
export async function stockMap(tenantId: string, productoIds?: string[]) {
  const rows = await prisma.movimiento.groupBy({
    by: ["productoId"],
    where: { tenantId, ...(productoIds ? { productoId: { in: productoIds } } : {}) },
    _sum: { cantidad: true },
  });
  const m = new Map<string, number>();
  for (const r of rows) m.set(r.productoId, r3(n(r._sum.cantidad)));
  return m;
}

export type ProductoDTO = {
  id: string; nombre: string; codigo: string | null; sku: string | null; categoria: string | null; categoriaId: string | null;
  unidad: string; esServicio: boolean; precio: number; costo: number; minimo: number; stock: number;
  proveedor: string | null; ubicacion: string | null; fotoUrl: string | null; activo: boolean;
};

/** Productos serializables para el cliente, con su existencia calculada. */
export async function productosDTO(tenantId: string, opts: { soloActivos?: boolean } = {}): Promise<ProductoDTO[]> {
  const [ps, sm] = await Promise.all([
    prisma.producto.findMany({
      where: { tenantId, ...(opts.soloActivos ? { activo: true } : {}) },
      include: { categoria: { select: { nombre: true } } },
      orderBy: { nombre: "asc" },
    }),
    stockMap(tenantId),
  ]);
  return ps.map((p) => ({
    id: p.id, nombre: p.nombre, codigo: p.codigo, sku: p.sku, categoria: p.categoria?.nombre ?? null, categoriaId: p.categoriaId,
    unidad: p.unidad, esServicio: p.esServicio, precio: n(p.precio), costo: n(p.costo), minimo: n(p.minimo),
    stock: sm.get(p.id) ?? 0, proveedor: p.proveedor, ubicacion: p.ubicacion, fotoUrl: p.fotoUrl, activo: p.activo,
  }));
}

export const isLow = (p: Pick<ProductoDTO, "esServicio" | "stock" | "minimo" | "activo">) =>
  p.activo && !p.esServicio && p.stock <= p.minimo;
