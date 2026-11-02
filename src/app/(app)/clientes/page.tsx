import { requirePage } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { saldoMap } from "@/lib/clientes";
import { n } from "@/lib/format";
import { ClientesView } from "./ClientesView";

export const metadata = { title: "Clientes" };

export default async function Clientes() {
  const s = await requirePage(["ADMIN", "CAJERO"]);
  const [cs, sm, ult] = await Promise.all([
    prisma.cliente.findMany({ where: { tenantId: s.tid }, orderBy: { nombre: "asc" } }),
    saldoMap(s.tid),
    prisma.movCliente.groupBy({ by: ["clienteId"], where: { tenantId: s.tid }, _max: { creado: true } }),
  ]);
  const um = new Map(ult.map((u) => [u.clienteId, u._max.creado?.toISOString() ?? null]));
  return (
    <ClientesView
      esAdmin={s.user.rol === "ADMIN"}
      clientes={cs.map((c) => ({
        id: c.id, nombre: c.nombre, telefono: c.telefono ?? "", email: c.email ?? "", rfc: c.rfc ?? "", nota: c.nota ?? "",
        limite: n(c.limiteCredito), saldo: sm.get(c.id) ?? 0, activo: c.activo, ultimo: um.get(c.id) ?? null,
      }))}
    />
  );
}
