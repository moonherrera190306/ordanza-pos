import { prisma } from "./db";
import type { Session } from "./auth";

export async function bitacora(s: Session, modulo: string, accion: string, detalle?: string) {
  await prisma.bitacora.create({
    data: { tenantId: s.tid, usuarioId: s.user.id, usuarioNombre: s.user.nombre, modulo, accion, detalle: detalle?.slice(0, 500) },
  });
}
