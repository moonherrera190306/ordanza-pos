import { requirePage } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { n } from "@/lib/format";
import { productosDTO } from "@/lib/stock";
import { ComprasView } from "./ComprasView";

export const metadata = { title: "Compras" };

export default async function Compras({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const s = await requirePage(["ADMIN", "ALMACEN"]);
  const sp = await searchParams;
  const [compras, provs, productos, turno] = await Promise.all([
    prisma.compra.findMany({ where: { tenantId: s.tid }, orderBy: { creado: "desc" }, take: 100, include: { proveedor: { select: { nombre: true } }, items: true } }),
    prisma.proveedor.findMany({ where: { tenantId: s.tid }, orderBy: { nombre: "asc" }, include: { _count: { select: { compras: true } } } }),
    productosDTO(s.tid, { soloActivos: true }),
    s.caja ? prisma.turno.findFirst({ where: { tenantId: s.tid, cajaId: s.caja.id, estado: "ABIERTO" }, select: { id: true } }) : null,
  ]);
  return (
    <ComprasView
      tab={sp.tab === "proveedores" ? "proveedores" : "compras"}
      tz={s.tenant.zonaHoraria}
      cajaAbierta={!!turno}
      productos={productos.filter((p) => !p.esServicio)}
      proveedores={provs.map((p) => ({ id: p.id, nombre: p.nombre, contacto: p.contacto ?? "", telefono: p.telefono ?? "", email: p.email ?? "", rfc: p.rfc ?? "", nota: p.nota ?? "", activo: p.activo, compras: p._count.compras }))}
      compras={compras.map((c) => ({
        id: c.id, proveedor: c.proveedor?.nombre ?? null, factura: c.factura, total: n(c.total), usuario: c.usuarioNombre, creado: c.creado.toISOString(), pagadoDeCaja: c.pagadoDeCaja, nota: c.nota,
        items: c.items.map((i) => ({ nombre: i.nombre, cantidad: n(i.cantidad), costo: n(i.costo), importe: n(i.importe) })),
      }))}
    />
  );
}
