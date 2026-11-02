"use server";

import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { createSession, destroySession, getDevice, getSession } from "@/lib/auth";

export type FormState = { error?: string; ok?: string } | undefined;

const MAX_FAILS = 5;
const SUSPENDIDO = "La cuenta de este negocio está suspendida. Comunícate con Ordanza para reactivarla.";
async function tenantActivo(tid: string) {
  return !!(await prisma.tenant.findFirst({ where: { id: tid, activo: true }, select: { id: true } }));
}
const LOCK_MIN = 5;

async function checkLock(u: { id: string; bloqueadoHasta: Date | null }) {
  if (u.bloqueadoHasta && u.bloqueadoHasta > new Date()) {
    const min = Math.ceil((u.bloqueadoHasta.getTime() - Date.now()) / 60000);
    return `Demasiados intentos. Espera ${min} min e intenta de nuevo.`;
  }
  return null;
}
async function fail(u: { id: string; intentosFallidos: number }) {
  const n = u.intentosFallidos + 1;
  await prisma.usuario.update({
    where: { id: u.id },
    data: n >= MAX_FAILS ? { intentosFallidos: 0, bloqueadoHasta: new Date(Date.now() + LOCK_MIN * 60000) } : { intentosFallidos: n },
  });
}
async function ok(u: { id: string; tenantId: string; nombre: string }, cajaId: string | null) {
  await prisma.usuario.update({ where: { id: u.id }, data: { intentosFallidos: 0, bloqueadoHasta: null } });
  await createSession({ uid: u.id, tid: u.tenantId, cajaId });
  await prisma.bitacora.create({
    data: { tenantId: u.tenantId, usuarioId: u.id, usuarioNombre: u.nombre, modulo: "Acceso", accion: "Inicio de sesión" },
  });
}

async function defaultCaja(tenantId: string) {
  const dev = await getDevice();
  if (dev?.tid === tenantId) return dev.cajaId;
  const c = await prisma.caja.findFirst({ where: { tenantId, activa: true }, orderBy: { clave: "asc" } });
  return c?.id ?? null;
}

export async function loginEmail(_: FormState, fd: FormData): Promise<FormState> {
  const email = String(fd.get("email") || "").trim().toLowerCase();
  const password = String(fd.get("password") || "");
  if (!email || !password) return { error: "Escribe tu correo y contraseña." };
  const u = await prisma.usuario.findUnique({ where: { email } });
  if (!u || !u.activo || !u.passwordHash) return { error: "Correo o contraseña incorrectos." };
  const locked = await checkLock(u);
  if (locked) return { error: locked };
  if (!(await bcrypt.compare(password, u.passwordHash))) {
    await fail(u);
    return { error: "Correo o contraseña incorrectos." };
  }
  if (!(await tenantActivo(u.tenantId))) return { error: SUSPENDIDO };
  await ok(u, u.rol === "ALMACEN" ? null : await defaultCaja(u.tenantId));
  redirect(u.rol === "CAJERO" ? "/venta" : "/inicio");
}

export async function loginPin(_: FormState, fd: FormData): Promise<FormState> {
  const dev = await getDevice();
  if (!dev) return { error: "Este equipo no está vinculado a una caja." };
  const uid = String(fd.get("uid") || "");
  const pin = String(fd.get("pin") || "");
  const u = await prisma.usuario.findFirst({ where: { id: uid, tenantId: dev.tid, activo: true } });
  if (!u) return { error: "Selecciona tu usuario." };
  const locked = await checkLock(u);
  if (locked) return { error: locked };
  if (!(await bcrypt.compare(pin, u.pinHash))) {
    await fail(u);
    return { error: "PIN incorrecto." };
  }
  if (!(await tenantActivo(u.tenantId))) return { error: SUSPENDIDO };
  const caja = await prisma.caja.findFirst({ where: { id: dev.cajaId, tenantId: dev.tid, activa: true } });
  await ok(u, u.rol === "ALMACEN" ? null : caja?.id ?? (await defaultCaja(u.tenantId)));
  redirect(u.rol === "CAJERO" ? "/venta" : "/inicio");
}

export async function logout() {
  const s = await getSession();
  if (s)
    await prisma.bitacora.create({
      data: { tenantId: s.tid, usuarioId: s.user.id, usuarioNombre: s.user.nombre, modulo: "Acceso", accion: "Cierre de sesión" },
    });
  await destroySession();
  redirect("/login");
}

const Registro = z.object({
  negocio: z.string().trim().min(2, "Escribe el nombre del negocio."),
  nombre: z.string().trim().min(2, "Escribe tu nombre."),
  email: z.string().trim().toLowerCase().email("Correo no válido."),
  password: z.string().min(8, "La contraseña debe tener al menos 8 caracteres."),
  pin: z.string().regex(/^\d{4,6}$/, "El PIN debe tener de 4 a 6 números."),
});

export async function registrar(_: FormState, fd: FormData): Promise<FormState> {
  if (process.env.REGISTRO_ABIERTO !== "true") return { error: "El registro está cerrado. Contacta a Ordanza." };
  const r = Registro.safeParse(Object.fromEntries(fd));
  if (!r.success) return { error: r.error.issues[0].message };
  const d = r.data;
  if (await prisma.usuario.findUnique({ where: { email: d.email } })) return { error: "Ese correo ya tiene cuenta." };
  const base = d.negocio.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 30) || "negocio";
  let slug = base;
  for (let i = 2; await prisma.tenant.findUnique({ where: { slug } }); i++) slug = `${base}-${i}`;
  const [ph, pinh] = await Promise.all([bcrypt.hash(d.password, 10), bcrypt.hash(d.pin, 10)]);
  const { u, c } = await prisma.$transaction(async (tx) => {
    const t = await tx.tenant.create({ data: { slug, nombre: d.negocio } });
    const c = await tx.caja.create({ data: { tenantId: t.id, nombre: "Caja 1", clave: "C1" } });
    const u = await tx.usuario.create({
      data: { tenantId: t.id, nombre: d.nombre, email: d.email, passwordHash: ph, pinHash: pinh, rol: "ADMIN" },
    });
    return { u, c };
  });
  await ok(u, c.id);
  redirect("/inicio");
}
