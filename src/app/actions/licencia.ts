"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { esSuperAdmin, getSession, requireAction, AuthError } from "@/lib/auth";
import { bitacora } from "@/lib/log";
import { run, UserError } from "@/lib/action";
import { firmarLicencia, verificarLicencia } from "@/lib/licencia";
import { MODO_LOCAL } from "@/lib/modo";

/** Activa la licencia de pago único en esta computadora (versión local). */
export async function activarLicencia(clave: string) {
  return run(async () => {
    const s = await requireAction(["ADMIN"]);
    if (!MODO_LOCAL) throw new UserError("La licencia local solo aplica a la versión instalada.");
    const r = verificarLicencia(clave);
    if (!r.ok) throw new UserError(r.error);
    await prisma.tenant.update({ where: { id: s.tid }, data: { licenciaClave: clave.trim().replace(/\s+/g, ""), maxCajas: r.datos.c, plan: "Licencia local" } });
    await bitacora(s, "Ajustes", "Licencia activada", `${r.datos.n} · ${r.datos.c} ${r.datos.c === 1 ? "caja" : "cajas"} · folio ${r.datos.id}`);
    revalidatePath("/", "layout");
  }, "Licencia activada. ¡Gracias por tu compra!");
}

const GenIn = z.object({
  negocio: z.string().trim().min(2, "Escribe el nombre del negocio.").max(80),
  equipo: z.string().trim().toUpperCase().regex(/^[0-9A-F]{4}(-[0-9A-F]{4}){3}$/, "El código de equipo es como 1A2B-3C4D-5E6F-7A8B."),
  cajas: z.number().int().min(1).max(50),
});

/** Solo Ordanza: genera la clave para un cliente a partir de su código de equipo. */
export async function generarLicencia(input: z.input<typeof GenIn>) {
  return run<string>(async () => {
    const s = await getSession();
    if (!s || !esSuperAdmin(s)) throw new AuthError("Solo el personal de Ordanza puede generar licencias.");
    const d = GenIn.parse(input);
    try {
      return firmarLicencia({ n: d.negocio, e: d.equipo, c: d.cajas });
    } catch (e) {
      throw new UserError((e as Error).message);
    }
  });
}
