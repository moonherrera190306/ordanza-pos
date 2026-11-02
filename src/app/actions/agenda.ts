"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAction } from "@/lib/auth";
import { bitacora } from "@/lib/log";
import { run, UserError } from "@/lib/action";

const CitaIn = z.object({
  id: z.string().optional(),
  titulo: z.string().trim().min(1, "Escribe el asunto.").max(160),
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha no válida."),
  hora: z.string().regex(/^(\d{2}:\d{2})?$/).optional(),
  cliente: z.string().trim().max(120).optional(),
  telefono: z.string().trim().max(40).optional(),
  nota: z.string().trim().max(500).optional(),
});
export type CitaInput = z.input<typeof CitaIn>;

export async function guardarCita(input: CitaInput) {
  return run(async () => {
    const s = await requireAction();
    const d = CitaIn.parse(input);
    const data = { titulo: d.titulo, fecha: d.fecha, hora: d.hora || null, cliente: d.cliente || null, telefono: d.telefono || null, nota: d.nota || null };
    if (d.id) {
      const r = await prisma.cita.updateMany({ where: { id: d.id, tenantId: s.tid }, data });
      if (!r.count) throw new UserError("No encontré la cita.");
    } else await prisma.cita.create({ data: { ...data, tenantId: s.tid, creadoPor: s.user.nombre } });
    await bitacora(s, "Agenda", d.id ? "Edición de cita" : "Nueva cita", `${d.titulo} · ${d.fecha} ${d.hora ?? ""}`);
    revalidatePath("/agenda");
    revalidatePath("/inicio");
  }, "Cita guardada");
}

export async function estadoCita(id: string, estado: "PENDIENTE" | "HECHA" | "CANCELADA") {
  return run(async () => {
    const s = await requireAction();
    const c = await prisma.cita.findFirst({ where: { id, tenantId: s.tid } });
    if (!c) throw new UserError("No encontré la cita.");
    await prisma.cita.update({ where: { id }, data: { estado } });
    await bitacora(s, "Agenda", { PENDIENTE: "Reabrir cita", HECHA: "Cita completada", CANCELADA: "Cita cancelada" }[estado], c.titulo);
    revalidatePath("/agenda");
    revalidatePath("/inicio");
  });
}
