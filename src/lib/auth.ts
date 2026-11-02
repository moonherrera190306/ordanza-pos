import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { SignJWT, jwtVerify } from "jose";
import type { Rol } from "@/generated/prisma/enums";
import { prisma } from "./db";

const SESSION = "ordz_s";
const DEVICE = "ordz_dev";
const key = () => new TextEncoder().encode(process.env.AUTH_SECRET || "dev-secret-cambia-esto");

type SessionPayload = { uid: string; tid: string; cajaId: string | null };
type DevicePayload = { tid: string; cajaId: string };

async function sign(payload: Record<string, unknown>, exp: string) {
  return new SignJWT(payload).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime(exp).sign(key());
}
async function verify<T>(token?: string): Promise<T | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, key());
    return payload as T;
  } catch {
    return null;
  }
}
const cookieOpts = (maxAge: number) => ({
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge,
});

export async function createSession(p: SessionPayload) {
  (await cookies()).set(SESSION, await sign(p, "12h"), cookieOpts(60 * 60 * 12));
}
export async function destroySession() {
  (await cookies()).delete(SESSION);
}

/** Equipo vinculado a una caja (para entrar con PIN). Dura 1 año. */
export async function setDevice(p: DevicePayload) {
  (await cookies()).set(DEVICE, await sign(p, "365d"), cookieOpts(60 * 60 * 24 * 365));
}
export async function clearDevice() {
  (await cookies()).delete(DEVICE);
}
export async function getDevice() {
  return verify<DevicePayload>((await cookies()).get(DEVICE)?.value);
}

/** Sesión actual con usuario, negocio y caja. null si no hay o el usuario ya no está activo. */
export const getSession = cache(async () => {
  const p = await verify<SessionPayload>((await cookies()).get(SESSION)?.value);
  if (!p) return null;
  const user = await prisma.usuario.findFirst({
    where: { id: p.uid, tenantId: p.tid, activo: true },
    select: { id: true, nombre: true, rol: true, email: true, tenantId: true },
  });
  if (!user) return null;
  const tenant = await prisma.tenant.findUnique({ where: { id: p.tid } });
  if (!tenant || !tenant.activo) return null;
  const caja = p.cajaId
    ? await prisma.caja.findFirst({ where: { id: p.cajaId, tenantId: p.tid, activa: true } })
    : null;
  return { user, tenant, caja, tid: tenant.id };
});

export type Session = NonNullable<Awaited<ReturnType<typeof getSession>>>;

/** Para páginas: redirige al login si no hay sesión o a inicio si el rol no alcanza. */
export async function requirePage(roles?: Rol[]) {
  const s = await getSession();
  if (!s) redirect("/login");
  if (roles && !roles.includes(s.user.rol)) redirect("/inicio");
  return s;
}

export class AuthError extends Error {}

/** Para server actions: lanza si no hay permiso. */
export async function requireAction(roles?: Rol[]) {
  const s = await getSession();
  if (!s) throw new AuthError("Tu sesión expiró. Vuelve a entrar.");
  if (roles && !roles.includes(s.user.rol)) throw new AuthError("No tienes permiso para esta acción.");
  return s;
}
