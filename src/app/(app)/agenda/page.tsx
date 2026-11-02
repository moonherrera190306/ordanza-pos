import { requirePage } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { addDays, ymdIn } from "@/lib/dates";
import { AgendaView } from "./AgendaView";

export const metadata = { title: "Agenda" };

export default async function Page({ searchParams }: { searchParams: Promise<{ d?: string; nueva?: string }> }) {
  const s = await requirePage();
  const sp = await searchParams;
  const hoy = ymdIn(s.tenant.zonaHoraria);
  const d = /^\d{4}-\d{2}-\d{2}$/.test(sp.d ?? "") ? sp.d! : hoy;
  const dow = (new Date(d + "T12:00:00Z").getUTCDay() + 6) % 7;
  const lunes = addDays(d, -dow);
  const fin = addDays(hoy, 7) > addDays(lunes, 6) ? addDays(hoy, 7) : addDays(lunes, 6);
  const citas = await prisma.cita.findMany({
    where: { tenantId: s.tid, estado: { not: "CANCELADA" }, fecha: { gte: lunes < hoy ? lunes : hoy, lte: fin } },
    orderBy: [{ fecha: "asc" }, { hora: "asc" }],
  });
  return (
    <AgendaView
      dia={d} hoy={hoy} lunes={lunes} nueva={sp.nueva === "1"}
      citas={citas.map((c) => ({ id: c.id, titulo: c.titulo, fecha: c.fecha, hora: c.hora, cliente: c.cliente, telefono: c.telefono, nota: c.nota, estado: c.estado }))}
    />
  );
}
