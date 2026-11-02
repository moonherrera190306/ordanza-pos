import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { respaldoResponse, respaldoTenant } from "@/lib/respaldo";

export async function GET() {
  const s = await getSession();
  if (!s) return new Response("Sesión expirada", { status: 401 });
  if (s.user.rol !== "ADMIN") return new Response("Sin permiso", { status: 403 });
  await prisma.bitacora.create({ data: { tenantId: s.tid, usuarioId: s.user.id, usuarioNombre: s.user.nombre, modulo: "Ajustes", accion: "Descarga de respaldo" } });
  return respaldoResponse(await respaldoTenant(s.tid), s.tenant.slug);
}
