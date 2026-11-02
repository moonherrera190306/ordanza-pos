import { esSuperAdmin, getDevice, requirePage } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { n } from "@/lib/format";
import { AjustesView } from "./AjustesView";

export const metadata = { title: "Ajustes" };

export default async function Ajustes() {
  const s = await requirePage(["ADMIN"]);
  const [cajas, usuarios, abiertos, dev] = await Promise.all([
    prisma.caja.findMany({ where: { tenantId: s.tid }, orderBy: { clave: "asc" } }),
    prisma.usuario.findMany({ where: { tenantId: s.tid }, orderBy: { nombre: "asc" }, select: { id: true, nombre: true, rol: true, email: true, activo: true, passwordHash: true } }),
    prisma.turno.findMany({ where: { tenantId: s.tid, estado: "ABIERTO" }, select: { cajaId: true, abiertoPor: true } }),
    getDevice(),
  ]);
  const t = s.tenant;
  return (
    <AjustesView
      meId={s.user.id}
      negocio={{ nombre: t.nombre, rfc: t.rfc ?? "", direccion: t.direccion ?? "", telefono: t.telefono ?? "", piePagina: t.piePagina, anchoTicket: t.anchoTicket === 80 ? 80 : 58, ivaPct: n(t.ivaPct), permitirSinStock: t.permitirSinStock, autorizarDescuento: t.autorizarDescuento, autorizarRetiro: t.autorizarRetiro, autorizarDevolucion: t.autorizarDevolucion }}
      licencia={{ plan: t.plan, maxCajas: t.maxCajas, pagadoHasta: t.pagadoHasta?.toISOString() ?? null }}
      superAdmin={esSuperAdmin(s)}
      cajas={cajas.map((c) => ({ id: c.id, nombre: c.nombre, clave: c.clave, activa: c.activa, abiertaPor: abiertos.find((a) => a.cajaId === c.id)?.abiertoPor ?? null }))}
      usuarios={usuarios.map((u) => ({ id: u.id, nombre: u.nombre, rol: u.rol, email: u.email ?? "", activo: u.activo, tienePassword: !!u.passwordHash }))}
      equipoCajaId={dev?.tid === s.tid ? dev.cajaId : null}
    />
  );
}
