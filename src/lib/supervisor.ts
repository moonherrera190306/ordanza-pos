import bcrypt from "bcryptjs";
import { prisma } from "./db";
import type { Session } from "./auth";
import { UserError } from "./action";

export type Permiso = "descuento" | "retiro" | "devolucion";

/** ¿Esta sesión necesita PIN de un administrador para el permiso? */
export function requiereAutorizacion(s: Session, p: Permiso) {
  if (s.user.rol !== "CAJERO") return false;
  const t = s.tenant;
  return p === "descuento" ? t.autorizarDescuento : p === "retiro" ? t.autorizarRetiro : t.autorizarDevolucion;
}

/** Busca un administrador activo del negocio cuyo PIN coincida. Regresa su nombre o null. */
export async function adminPorPin(tid: string, pin?: string) {
  if (!pin || !/^\d{4,6}$/.test(pin)) return null;
  const admins = await prisma.usuario.findMany({ where: { tenantId: tid, rol: "ADMIN", activo: true }, select: { nombre: true, pinHash: true } });
  for (const a of admins) if (await bcrypt.compare(pin, a.pinHash)) return a.nombre;
  await new Promise((r) => setTimeout(r, 600)); // frena intentos por fuerza bruta
  return null;
}

/**
 * Si el permiso lo exige, valida el PIN y regresa quién autorizó.
 * Si no lo exige, regresa null. Lanza si falta o es incorrecto.
 */
export async function autorizar(s: Session, p: Permiso, pin?: string) {
  if (!requiereAutorizacion(s, p)) return null;
  const quien = await adminPorPin(s.tid, pin);
  if (!quien) {
    await prisma.bitacora.create({
      data: { tenantId: s.tid, usuarioId: s.user.id, usuarioNombre: s.user.nombre, modulo: "Seguridad", accion: "PIN de supervisor incorrecto", detalle: p },
    });
    throw new UserError(pin ? "PIN de supervisor incorrecto." : "Esta operación necesita el PIN de un administrador.");
  }
  return quien;
}
