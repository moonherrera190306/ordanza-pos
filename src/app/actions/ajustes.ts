"use server";

import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { clearDevice, createSession, requireAction, setDevice } from "@/lib/auth";
import { bitacora } from "@/lib/log";
import { run, UserError } from "@/lib/action";
import { ROLES } from "@/lib/format";

const NegocioIn = z.object({
  nombre: z.string().trim().min(2, "Escribe el nombre del negocio.").max(120),
  rfc: z.string().trim().max(13).optional(),
  direccion: z.string().trim().max(200).optional(),
  telefono: z.string().trim().max(40).optional(),
  piePagina: z.string().trim().max(160).optional(),
  anchoTicket: z.union([z.literal(58), z.literal(80)]),
  ivaPct: z.number().min(0).max(100),
  permitirSinStock: z.boolean(),
});

export async function guardarNegocio(input: z.input<typeof NegocioIn>) {
  return run(async () => {
    const s = await requireAction(["ADMIN"]);
    const d = NegocioIn.parse(input);
    await prisma.tenant.update({
      where: { id: s.tid },
      data: { ...d, rfc: d.rfc?.toUpperCase() || null, direccion: d.direccion || null, telefono: d.telefono || null, piePagina: d.piePagina || "¡Gracias por su compra!" },
    });
    await bitacora(s, "Ajustes", "Datos del negocio actualizados", d.nombre);
    revalidatePath("/", "layout");
  }, "Datos guardados");
}

const CajaIn = z.object({
  id: z.string().optional(),
  nombre: z.string().trim().min(1, "Escribe el nombre de la caja.").max(40),
  clave: z.string().trim().toUpperCase().regex(/^[A-Z0-9]{1,4}$/, "La clave lleva de 1 a 4 letras o números (va en los folios)."),
  activa: z.boolean(),
});

export async function guardarCaja(input: z.input<typeof CajaIn>) {
  return run(async () => {
    const s = await requireAction(["ADMIN"]);
    const d = CajaIn.parse(input);
    if (d.id) {
      if (!d.activa) {
        const abierta = await prisma.turno.findFirst({ where: { tenantId: s.tid, cajaId: d.id, estado: "ABIERTO" } });
        if (abierta) throw new UserError("Haz el corte de esa caja antes de desactivarla.");
      }
      const r = await prisma.caja.updateMany({ where: { id: d.id, tenantId: s.tid }, data: { nombre: d.nombre, clave: d.clave, activa: d.activa } });
      if (!r.count) throw new UserError("No encontré la caja.");
    } else await prisma.caja.create({ data: { tenantId: s.tid, nombre: d.nombre, clave: d.clave, activa: d.activa } });
    await bitacora(s, "Ajustes", d.id ? "Edición de caja" : "Alta de caja", `${d.nombre} (${d.clave})${d.activa ? "" : " · desactivada"}`);
    revalidatePath("/", "layout");
  }, "Caja guardada");
}

const UsuarioIn = z.object({
  id: z.string().optional(),
  nombre: z.string().trim().min(2, "Escribe el nombre.").max(80),
  rol: z.enum(["ADMIN", "CAJERO", "ALMACEN"]),
  email: z.string().trim().toLowerCase().email("Correo no válido.").optional().or(z.literal("")),
  password: z.string().optional(),
  pin: z.string().optional(),
  activo: z.boolean(),
});

export async function guardarUsuario(input: z.input<typeof UsuarioIn>) {
  return run(async () => {
    const s = await requireAction(["ADMIN"]);
    const d = UsuarioIn.parse(input);
    if ((!d.id || d.pin) && !/^\d{4,6}$/.test(d.pin ?? "")) throw new UserError("El PIN debe tener de 4 a 6 números.");
    if (d.password && d.password.length < 8) throw new UserError("La contraseña debe tener al menos 8 caracteres.");
    if (d.rol === "ADMIN" && !d.email) throw new UserError("Un administrador necesita correo para entrar desde cualquier equipo.");
    const prev = d.id ? await prisma.usuario.findFirst({ where: { id: d.id, tenantId: s.tid } }) : null;
    if (d.id && !prev) throw new UserError("No encontré el usuario.");
    if (d.rol === "ADMIN" && !prev?.passwordHash && !d.password) throw new UserError("Ponle una contraseña al administrador.");
    if (prev?.rol === "ADMIN" && (d.rol !== "ADMIN" || !d.activo)) {
      const otros = await prisma.usuario.count({ where: { tenantId: s.tid, rol: "ADMIN", activo: true, id: { not: prev.id } } });
      if (!otros) throw new UserError("Debe quedar al menos un administrador activo.");
    }
    if (d.email) {
      const dup = await prisma.usuario.findUnique({ where: { email: d.email } });
      if (dup && dup.id !== d.id) throw new UserError("Ese correo ya está en uso.");
    }
    const data = {
      nombre: d.nombre, rol: d.rol, activo: d.activo, email: d.email || null,
      ...(d.pin ? { pinHash: await bcrypt.hash(d.pin, 10) } : {}),
      ...(d.password ? { passwordHash: await bcrypt.hash(d.password, 10) } : {}),
      ...(d.pin || d.password ? { intentosFallidos: 0, bloqueadoHasta: null } : {}),
    };
    if (prev) await prisma.usuario.update({ where: { id: prev.id }, data });
    else await prisma.usuario.create({ data: { ...data, tenantId: s.tid, pinHash: data.pinHash! } });
    const cambios = [d.pin && prev ? "PIN cambiado" : "", d.password && prev ? "contraseña cambiada" : "", !d.activo ? "desactivado" : ""].filter(Boolean);
    await bitacora(s, "Usuarios", prev ? "Edición de usuario" : "Alta de usuario", `${d.nombre} · ${ROLES[d.rol]}${cambios.length ? " · " + cambios.join(", ") : ""}`);
    revalidatePath("/ajustes");
  }, "Usuario guardado");
}

/** Vincula este navegador a una caja: el equipo queda listo para entrar con PIN. */
export async function vincularEquipo(cajaId: string) {
  return run(async () => {
    const s = await requireAction(["ADMIN"]);
    const c = await prisma.caja.findFirst({ where: { id: cajaId, tenantId: s.tid, activa: true } });
    if (!c) throw new UserError("Elige una caja activa.");
    await setDevice({ tid: s.tid, cajaId: c.id });
    await createSession({ uid: s.user.id, tid: s.tid, cajaId: c.id });
    await bitacora(s, "Ajustes", "Equipo vinculado a caja", c.nombre);
    revalidatePath("/", "layout");
  }, "Este equipo quedó vinculado");
}

export async function desvincularEquipo() {
  return run(async () => {
    const s = await requireAction(["ADMIN"]);
    await clearDevice();
    await bitacora(s, "Ajustes", "Equipo desvinculado");
    revalidatePath("/", "layout");
  }, "Equipo desvinculado");
}
