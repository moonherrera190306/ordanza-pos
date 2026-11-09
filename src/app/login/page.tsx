import { redirect } from "next/navigation";
import { getDevice, getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { LoginView } from "./LoginView";
import { registroAbierto } from "@/lib/registro";
import { MODO_LOCAL } from "@/lib/modo";

export const metadata = { title: "Entrar" };

export default async function LoginPage() {
  if (await getSession()) redirect("/inicio");
  // Primer arranque de la versión local: configurar el negocio.
  if (MODO_LOCAL && (await prisma.tenant.count()) === 0) redirect("/registro");
  const dev = await getDevice();
  let device: { negocio: string; caja: string; usuarios: { id: string; nombre: string; rol: string }[] } | null = null;
  if (dev) {
    const [t, c, us] = await Promise.all([
      prisma.tenant.findUnique({ where: { id: dev.tid } }),
      prisma.caja.findFirst({ where: { id: dev.cajaId, tenantId: dev.tid } }),
      prisma.usuario.findMany({ where: { tenantId: dev.tid, activo: true }, select: { id: true, nombre: true, rol: true }, orderBy: { nombre: "asc" } }),
    ]);
    if (t && c) device = { negocio: t.nombre, caja: c.nombre, usuarios: us };
  }
  return <LoginView device={device} registroAbierto={!MODO_LOCAL && (await registroAbierto())} />;
}
