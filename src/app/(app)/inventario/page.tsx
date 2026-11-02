import { requirePage } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { productosDTO } from "@/lib/stock";
import { n } from "@/lib/format";
import { InventarioView } from "./InventarioView";

export const metadata = { title: "Inventario" };

export default async function Page({ searchParams }: { searchParams: Promise<{ p?: string; tipo?: string }> }) {
  const s = await requirePage(["ADMIN", "ALMACEN"]);
  const sp = await searchParams;
  const tipo = ["ENTRADA", "SALIDA", "AJUSTE", "VENTA", "CANCELACION", "INICIAL"].includes(sp.tipo ?? "") ? sp.tipo : undefined;
  const [productos, movs] = await Promise.all([
    productosDTO(s.tid),
    prisma.movimiento.findMany({
      where: { tenantId: s.tid, ...(tipo ? { tipo: tipo as never } : {}) },
      include: { producto: { select: { nombre: true } } },
      orderBy: { creado: "desc" },
      take: 100,
    }),
  ]);
  return (
    <InventarioView
      productos={productos.filter((p) => !p.esServicio)}
      movs={movs.map((m) => ({ id: m.id, tipo: m.tipo, cantidad: n(m.cantidad), producto: m.producto.nombre, usuario: m.usuarioNombre, nota: m.nota, creado: m.creado.toISOString() }))}
      tipo={tipo ?? ""}
      initialId={sp.p ?? null}
      tz={s.tenant.zonaHoraria}
    />
  );
}
