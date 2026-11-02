import { requirePage } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { productosDTO } from "@/lib/stock";
import { n } from "@/lib/format";
import { clientesDTO } from "@/lib/clientes";
import { requiereAutorizacion } from "@/lib/supervisor";
import { Pos } from "./Pos";
import { AbrirTurno } from "./AbrirTurno";

export const metadata = { title: "Vender" };

export default async function VentaPage() {
  const s = await requirePage(["ADMIN", "CAJERO"]);
  if (!s.caja)
    return (
      <div className="wrap">
        <div className="panel shift-card">
          <h2>Sin caja asignada</h2>
          <p className="muted">Este equipo no tiene caja. Un administrador debe crear una caja en Ajustes y vincular este equipo, o vuelve a entrar.</p>
        </div>
      </div>
    );
  const turno = await prisma.turno.findFirst({ where: { tenantId: s.tid, cajaId: s.caja.id, estado: "ABIERTO" } });
  if (!turno) return <AbrirTurno caja={s.caja.nombre} />;
  const [productos, clientes] = await Promise.all([productosDTO(s.tid, { soloActivos: true }), clientesDTO(s.tid)]);
  return (
    <Pos
      productos={productos}
      clientes={clientes}
      auth={{ descuento: requiereAutorizacion(s, "descuento"), retiro: requiereAutorizacion(s, "retiro"), devolucion: requiereAutorizacion(s, "devolucion") }}
      caja={s.caja.nombre}
      cajero={s.user.nombre}
      ivaPct={n(s.tenant.ivaPct)}
      sinStock={s.tenant.permitirSinStock}
    />
  );
}
