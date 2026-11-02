"use server";

import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { esSuperAdmin, getSession, AuthError } from "@/lib/auth";
import { run, UserError } from "@/lib/action";

async function soloOrdanza() {
  const s = await getSession();
  if (!s || !esSuperAdmin(s)) throw new AuthError("Solo el personal de Ordanza puede hacer esto.");
  return s;
}

const fechaOpt = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal(""));
const slugify = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 30) || "negocio";

const NegocioIn = z.object({
  negocio: z.string().trim().min(2, "Escribe el nombre del negocio."),
  admin: z.string().trim().min(2, "Escribe el nombre del administrador."),
  email: z.string().trim().toLowerCase().email("Correo no válido."),
  password: z.string().min(8, "La contraseña debe tener al menos 8 caracteres."),
  pin: z.string().regex(/^\d{4,6}$/, "El PIN debe tener de 4 a 6 números."),
  plan: z.string().trim().min(1).max(40),
  maxCajas: z.number().int().min(1).max(50),
  pagadoHasta: fechaOpt,
});

/** Alta de un negocio cliente con su administrador y su primera caja. */
export async function crearNegocio(input: z.input<typeof NegocioIn>) {
  return run<string>(async () => {
    await soloOrdanza();
    const d = NegocioIn.parse(input);
    if (await prisma.usuario.findUnique({ where: { email: d.email } })) throw new UserError("Ese correo ya tiene cuenta.");
    let slug = slugify(d.negocio);
    for (let i = 2; await prisma.tenant.findUnique({ where: { slug } }); i++) slug = `${slugify(d.negocio)}-${i}`;
    const [ph, pinh] = await Promise.all([bcrypt.hash(d.password, 10), bcrypt.hash(d.pin, 10)]);
    const t = await prisma.$transaction(async (tx) => {
      const t = await tx.tenant.create({
        data: { slug, nombre: d.negocio, plan: d.plan, maxCajas: d.maxCajas, pagadoHasta: d.pagadoHasta ? new Date(d.pagadoHasta + "T23:59:59-06:00") : null },
      });
      await tx.caja.create({ data: { tenantId: t.id, nombre: "Caja 1", clave: "C1" } });
      await tx.usuario.create({ data: { tenantId: t.id, nombre: d.admin, email: d.email, passwordHash: ph, pinHash: pinh, rol: "ADMIN" } });
      return t;
    });
    revalidatePath("/ordanza");
    return t.id;
  }, "Negocio creado");
}

const LicIn = z.object({
  id: z.string(),
  plan: z.string().trim().min(1).max(40),
  maxCajas: z.number().int().min(1).max(50),
  pagadoHasta: fechaOpt,
  activo: z.boolean(),
  notas: z.string().trim().max(500).optional(),
});

export async function actualizarLicencia(input: z.input<typeof LicIn>) {
  return run(async () => {
    await soloOrdanza();
    const d = LicIn.parse(input);
    await prisma.tenant.update({
      where: { id: d.id },
      data: { plan: d.plan, maxCajas: d.maxCajas, pagadoHasta: d.pagadoHasta ? new Date(d.pagadoHasta + "T23:59:59-06:00") : null, activo: d.activo, notasOrdanza: d.notas || null },
    });
    revalidatePath("/ordanza");
  }, "Licencia actualizada");
}
