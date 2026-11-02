import { notFound } from "next/navigation";
import Link from "next/link";
import { requirePage } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { fmtDT } from "@/lib/dates";
import { METODOS, money, n, qty } from "@/lib/format";
import { Icon } from "@/components/Icon";
import { CancelarVenta } from "./CancelarVenta";
import { Devolver } from "./Devolver";

export const metadata = { title: "Venta" };

export default async function VentaDetalle({ params }: { params: Promise<{ id: string }> }) {
  const s = await requirePage(["ADMIN"]);
  const { id } = await params;
  const v = await prisma.venta.findFirst({ where: { id, tenantId: s.tid }, include: { items: true, caja: true, pagos: true, devoluciones: { include: { items: true }, orderBy: { creado: "asc" } } } });
  if (!v) notFound();
  const tz = s.tenant.zonaHoraria;
  return (
    <div className="wrap narrow">
      <div className="phead">
        <div>
          <p className="eyebrow"><Link className="link" href="/reportes?tab=ventas">Reportes</Link> · Venta</p>
          <h1 className="mono">{v.folio}</h1>
        </div>
        <div className="acts">
          <a className="btn" href={`/imprimir/ticket/${v.id}`} target="_blank"><Icon name="printer" />Reimprimir</a>
          {v.estado === "PAGADA" && v.items.some((i) => n(i.devuelto) < n(i.cantidad)) && <Devolver folio={v.folio} />}
          {v.estado === "PAGADA" && !v.devoluciones.length && <CancelarVenta id={v.id} folio={v.folio} />}
        </div>
      </div>
      <div className="kpis">
        <div className="kpi"><span className="lbl">Total</span><strong className="val">{money(v.total)}</strong><span className="sub">{v.pagos.map((p) => `${METODOS[p.metodo]} ${money(p.monto)}`).join(" + ")}</span></div>
        <div className="kpi"><span className="lbl">Utilidad</span><strong className="val">{money(n(v.total) - n(v.costo))}</strong></div>
        <div className="kpi"><span className="lbl">Fecha</span><strong className="val" style={{ fontSize: "1.1rem" }}>{fmtDT(v.creado, tz)}</strong><span className="sub">{v.caja.nombre} · {v.usuarioNombre}</span></div>
        <div className="kpi"><span className="lbl">Estado</span><strong className="val" style={{ fontSize: "1.1rem" }}>{v.estado === "PAGADA" ? "Pagada" : "Cancelada"}</strong><span className="sub">{v.canceladaPor ? `${v.canceladaPor} · ${v.motivoCancelacion}` : v.cliente || "Público en general"}</span></div>
      </div>
      <div className="tbl">
        <table>
          <thead><tr><th>Producto</th><th className="num">Cantidad</th><th className="num">Devuelto</th><th className="num">Precio</th><th className="num">Importe</th></tr></thead>
          <tbody>
            {v.items.map((i) => (
              <tr key={i.id}><td>{i.nombre}</td><td className="num">{qty(i.cantidad)} {i.unidad}</td><td className="num">{n(i.devuelto) ? qty(i.devuelto) : "—"}</td><td className="num">{money(i.precio)}</td><td className="num">{money(i.importe)}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
      {v.autorizadoPor && <p className="muted">Descuento de {money(v.descuento)} autorizado por {v.autorizadoPor}.</p>}
      {v.devoluciones.length > 0 && (
        <section className="panel">
          <h3>Devoluciones</h3>
          <div className="list">
            {v.devoluciones.map((d) => (
              <div key={d.id} className="li">
                <div className="t">
                  <b>{d.items.map((i) => `${qty(i.cantidad)} × ${i.nombre}`).join(", ")}</b>
                  <small>{fmtDT(d.creado, tz)} · {d.usuarioNombre} · {METODOS[d.metodo]} · {d.motivo}{d.autorizadoPor ? ` · autorizó ${d.autorizadoPor}` : ""}</small>
                </div>
                <b className="mono">−{money(d.total)}</b>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
