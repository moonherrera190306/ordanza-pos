import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { rangeOf, ymdIn } from "@/lib/dates";
import { METODOS, MOV_TIPOS, n } from "@/lib/format";
import { csv, periodo } from "@/lib/periodo";
import { stockMap } from "@/lib/stock";

/** Descargas CSV: ventas, productos, movimientos y bitácora. Solo administradores. */
export async function GET(req: Request, { params }: { params: Promise<{ tipo: string }> }) {
  const s = await getSession();
  if (!s) return new Response("Sesión expirada", { status: 401 });
  const { tipo } = await params;
  const permitido = s.user.rol === "ADMIN" || (s.user.rol === "ALMACEN" && (tipo === "productos" || tipo === "movimientos"));
  if (!permitido) return new Response("Sin permiso", { status: 403 });

  const tz = s.tenant.zonaHoraria;
  const url = new URL(req.url);
  const per = periodo(ymdIn(tz), { desde: url.searchParams.get("desde") ?? undefined, hasta: url.searchParams.get("hasta") ?? undefined, p: "30d" });
  const rango = rangeOf(tz, per.desde, per.hasta);
  const fecha = (d: Date) => d.toLocaleString("es-MX", { timeZone: tz });
  let rows: unknown[][];
  let nombre: string;

  if (tipo === "ventas") {
    const vs = await prisma.venta.findMany({ where: { tenantId: s.tid, creado: rango }, orderBy: { creado: "asc" }, include: { caja: true } });
    rows = [["Folio", "Fecha", "Caja", "Usuario", "Cliente", "Método", "Subtotal", "Descuento", "IVA", "Total", "Costo", "Utilidad", "Estado", "Motivo cancelación"],
      ...vs.map((v) => [v.folio, fecha(v.creado), v.caja.nombre, v.usuarioNombre, v.cliente, METODOS[v.metodo], n(v.subtotal), n(v.descuento), n(v.iva), n(v.total), n(v.costo), n(v.total) - n(v.costo), v.estado === "PAGADA" ? "Pagada" : "Cancelada", v.motivoCancelacion])];
    nombre = `ventas-${per.desde}-a-${per.hasta}`;
  } else if (tipo === "productos") {
    const [ps, sm] = await Promise.all([prisma.producto.findMany({ where: { tenantId: s.tid }, include: { categoria: true }, orderBy: { nombre: "asc" } }), stockMap(s.tid)]);
    rows = [["Nombre", "Código", "SKU", "Categoría", "Unidad", "Precio", "Costo", "Existencia", "Mínimo", "Proveedor", "Ubicación", "Disponible"],
      ...ps.map((p) => [p.nombre, p.codigo, p.sku, p.categoria?.nombre, p.unidad, n(p.precio), n(p.costo), p.esServicio ? "" : sm.get(p.id) ?? 0, n(p.minimo), p.proveedor, p.ubicacion, p.activo ? "Sí" : "No"])];
    nombre = `productos-${ymdIn(tz)}`;
  } else if (tipo === "movimientos") {
    const ms = await prisma.movimiento.findMany({ where: { tenantId: s.tid, creado: rango }, orderBy: { creado: "asc" }, include: { producto: { select: { nombre: true, codigo: true } } } });
    rows = [["Fecha", "Producto", "Código", "Tipo", "Cantidad", "Usuario", "Nota"],
      ...ms.map((m) => [fecha(m.creado), m.producto.nombre, m.producto.codigo, MOV_TIPOS[m.tipo], n(m.cantidad), m.usuarioNombre, m.nota])];
    nombre = `movimientos-${per.desde}-a-${per.hasta}`;
  } else if (tipo === "bitacora") {
    const bs = await prisma.bitacora.findMany({ where: { tenantId: s.tid, creado: rango }, orderBy: { creado: "asc" } });
    rows = [["Fecha", "Usuario", "Módulo", "Acción", "Detalle"], ...bs.map((b) => [fecha(b.creado), b.usuarioNombre, b.modulo, b.accion, b.detalle])];
    nombre = `bitacora-${per.desde}-a-${per.hasta}`;
  } else return new Response("No existe", { status: 404 });

  return new Response(csv(rows), {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${nombre}.csv"` },
  });
}
