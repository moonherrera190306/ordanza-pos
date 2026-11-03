import Link from "next/link";
import { requireSuperAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { n } from "@/lib/format";
import { OrdanzaView } from "./OrdanzaView";
import { Logo } from "@/components/Logo";

export const metadata = { title: "Panel Ordanza" };

export default async function Ordanza() {
  await requireSuperAdmin();
  const hace30 = new Date(Date.now() - 30 * 864e5);
  const [ts, ventas, ult, cajas, usuarios] = await Promise.all([
    prisma.tenant.findMany({ orderBy: { creado: "desc" } }),
    prisma.venta.groupBy({ by: ["tenantId"], where: { estado: "PAGADA", creado: { gte: hace30 } }, _sum: { total: true }, _count: true }),
    prisma.venta.groupBy({ by: ["tenantId"], _max: { creado: true } }),
    prisma.caja.groupBy({ by: ["tenantId"], where: { activa: true }, _count: true }),
    prisma.usuario.groupBy({ by: ["tenantId"], where: { activo: true }, _count: true }),
  ]);
  const by = <T extends { tenantId: string }>(a: T[]) => new Map(a.map((x) => [x.tenantId, x]));
  const vm = by(ventas), um = by(ult), cm = by(cajas), usm = by(usuarios);
  return (
    <div className="ord">
      <header className="ord-top">
        <div className="row gap"><Logo variant="marca" size={30} /><b style={{ fontFamily: "var(--f-display)", fontSize: "1.1rem" }}>Ordanza</b><span className="pill acc nodot">Panel interno</span></div>
        <Link className="btn sm" href="/inicio">Volver a mi negocio</Link>
      </header>
      <OrdanzaView
        hoy={new Date().toISOString()}
        negocios={ts.map((t) => ({
          id: t.id, nombre: t.nombre, slug: t.slug, plan: t.plan, maxCajas: t.maxCajas, activo: t.activo, notas: t.notasOrdanza ?? "",
          pagadoHasta: t.pagadoHasta?.toISOString() ?? null, creado: t.creado.toISOString(),
          ventas30: n(vm.get(t.id)?._sum.total), tickets30: vm.get(t.id)?._count ?? 0,
          ultimaVenta: um.get(t.id)?._max.creado?.toISOString() ?? null,
          cajas: cm.get(t.id)?._count ?? 0, usuarios: usm.get(t.id)?._count ?? 0,
        }))}
      />
    </div>
  );
}
