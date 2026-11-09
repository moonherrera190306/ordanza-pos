import { requirePage } from "@/lib/auth";
import { estadoLicencia } from "@/lib/licencia";
import { prisma } from "@/lib/db";
import { productosDTO, isLow } from "@/lib/stock";
import { Shell } from "@/components/Shell";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const s = await requirePage();
  const [low, turno] = await Promise.all([
    productosDTO(s.tid, { soloActivos: true }).then((ps) => ps.filter(isLow).length),
    s.caja ? prisma.turno.findFirst({ where: { tenantId: s.tid, cajaId: s.caja.id, estado: "ABIERTO" }, select: { id: true } }) : null,
  ]);
  const lic = estadoLicencia(s.tenant);
  const aviso =
    lic.modo === "vencida" ? "Terminó la prueba de 15 días: el sistema quedó en modo consulta. Un administrador puede activar la licencia en Ajustes."
    : lic.modo === "prueba" && s.user.rol === "ADMIN" ? `Versión de prueba: ${lic.dias === 1 ? "queda 1 día" : `quedan ${lic.dias} días`}. Activa tu licencia en Ajustes.`
    : lic.modo === "nube" && s.user.rol === "ADMIN" && s.tenant.pagadoHasta && s.tenant.pagadoHasta < new Date()
      ? `Tu licencia venció el ${s.tenant.pagadoHasta.toLocaleDateString("es-MX", { day: "numeric", month: "long" })}. Comunícate con Ordanza para renovarla y evitar la suspensión.`
    : null;
  return (
    <Shell
      user={{ nombre: s.user.nombre, rol: s.user.rol }}
      negocio={s.tenant.nombre}
      caja={s.caja ? { nombre: s.caja.nombre, abierta: !!turno } : null}
      lowCount={low}
      aviso={aviso}
    >
      {children}
    </Shell>
  );
}
