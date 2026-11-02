import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePage } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { fmtDT } from "@/lib/dates";
import { METODOS, money, n, r2 } from "@/lib/format";
import { Empty } from "@/components/ui";
import { ClienteAcciones } from "./ClienteAcciones";

export const metadata = { title: "Cliente" };

export default async function Cliente({ params }: { params: Promise<{ id: string }> }) {
  const s = await requirePage(["ADMIN", "CAJERO"]);
  const { id } = await params;
  const c = await prisma.cliente.findFirst({ where: { id, tenantId: s.tid } });
  if (!c) notFound();
  const tz = s.tenant.zonaHoraria;
  const [movs, ventas, turno] = await Promise.all([
    prisma.movCliente.findMany({ where: { tenantId: s.tid, clienteId: c.id }, orderBy: { creado: "asc" } }),
    prisma.venta.findMany({ where: { tenantId: s.tid, clienteId: c.id }, orderBy: { creado: "desc" }, take: 20, select: { id: true, folio: true, total: true, creado: true, estado: true } }),
    s.caja ? prisma.turno.findFirst({ where: { tenantId: s.tid, cajaId: s.caja.id, estado: "ABIERTO" }, select: { id: true } }) : null,
  ]);
  let corr = 0;
  const rows = movs.map((m) => { corr = r2(corr + (m.tipo === "CARGO" ? 1 : -1) * n(m.monto)); return { ...m, saldo: corr }; }).reverse();
  const saldo = corr;
  const limite = n(c.limiteCredito);
  const folioId = new Map(ventas.map((v) => [v.id, v]));

  return (
    <div className="wrap">
      <div className="phead">
        <div><p className="eyebrow"><Link className="link" href="/clientes">Clientes</Link> · Estado de cuenta</p><h1>{c.nombre}</h1></div>
        <ClienteAcciones
          cliente={{ id: c.id, nombre: c.nombre, telefono: c.telefono ?? "", email: c.email ?? "", rfc: c.rfc ?? "", nota: c.nota ?? "", limite, saldo, activo: c.activo, ultimo: null }}
          esAdmin={s.user.rol === "ADMIN"} cajaAbierta={!!turno}
        />
      </div>
      <div className="kpis">
        <div className="kpi"><span className="lbl">Saldo</span><strong className="val">{money(saldo)}</strong><span className="sub">{saldo > 0 ? "por cobrar" : "al corriente"}</span></div>
        <div className="kpi"><span className="lbl">Límite de crédito</span><strong className="val">{limite ? money(limite) : "—"}</strong><span className="sub">{limite ? "" : "sin crédito"}&nbsp;</span></div>
        <div className="kpi"><span className="lbl">Disponible</span><strong className="val">{limite ? money(Math.max(0, limite - saldo)) : "—"}</strong><span className="sub">&nbsp;</span></div>
        <div className="kpi"><span className="lbl">Contacto</span><strong className="val" style={{ fontSize: "1.05rem" }}>{c.telefono || "—"}</strong><span className="sub">{c.email || c.rfc || " "}</span></div>
      </div>
      <div className="grid3">
        <section className="panel span2">
          <h3>Movimientos de la cuenta</h3>
          {rows.length ? (
            <div className="list">
              {rows.map((m) => {
                const v = m.ventaId ? folioId.get(m.ventaId) : null;
                return (
                  <div key={m.id} className="li">
                    <span className={`pill ${m.tipo === "CARGO" ? "warn" : "ok"}`}>{m.tipo === "CARGO" ? "Cargo" : "Abono"}</span>
                    <div className="t">
                      <b>{v && s.user.rol === "ADMIN" ? <Link className="link" href={`/ventas/${v.id}`}>{m.nota}</Link> : m.nota}</b>
                      <small>{fmtDT(m.creado, tz)} · {m.usuarioNombre}{m.metodo ? ` · ${METODOS[m.metodo]}` : ""} · saldo {money(m.saldo)}</small>
                    </div>
                    <b className="mono">{m.tipo === "CARGO" ? "+" : "−"}{money(m.monto)}</b>
                  </div>
                );
              })}
            </div>
          ) : <Empty icon="list" title="Sin movimientos" />}
        </section>
        <section className="panel">
          <h3>Compras recientes</h3>
          {ventas.length ? (
            <div className="list">
              {ventas.map((v) => (
                <div key={v.id} className="li">
                  <div className="t"><b className="mono">{v.folio}</b><small>{fmtDT(v.creado, tz)}{v.estado === "CANCELADA" ? " · cancelada" : ""}</small></div>
                  <b className="mono">{money(v.total)}</b>
                </div>
              ))}
            </div>
          ) : <Empty icon="cart" title="Sin compras registradas" />}
          {c.nota && <p className="muted" style={{ fontSize: ".86rem" }}>Nota: {c.nota}</p>}
        </section>
      </div>
    </div>
  );
}
