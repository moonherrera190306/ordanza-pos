import Link from "next/link";
import { requirePage } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { addDays, fmtDT, rangeOf, ymdIn } from "@/lib/dates";
import { METODOS, money, n, qty, r2 } from "@/lib/format";
import { PRESETS, periodo } from "@/lib/periodo";
import { stockMap } from "@/lib/stock";
import { BarChart, HBars } from "@/components/Charts";
import { Icon } from "@/components/Icon";
import { Empty } from "@/components/ui";

export const metadata = { title: "Reportes" };

const TABS = [["resumen", "Resumen"], ["ventas", "Ventas"], ["productos", "Productos"], ["cortes", "Cortes de caja"]] as const;
type SP = { tab?: string; p?: string; desde?: string; hasta?: string };

export default async function Reportes({ searchParams }: { searchParams: Promise<SP> }) {
  const s = await requirePage(["ADMIN"]);
  const sp = await searchParams;
  const tz = s.tenant.zonaHoraria;
  const per = periodo(ymdIn(tz), sp);
  const tab = TABS.some(([k]) => k === sp.tab) ? sp.tab! : "resumen";
  const rango = rangeOf(tz, per.desde, per.hasta);
  const qs = (o: Partial<SP>) => {
    const base: Record<string, string> = { tab, ...(per.preset ? { p: per.preset } : { desde: per.desde, hasta: per.hasta }) };
    const m = { ...base, ...o } as Record<string, string | undefined>;
    if (o.p) { delete m.desde; delete m.hasta; }
    return "?" + new URLSearchParams(Object.entries(m).filter(([, v]) => v) as [string, string][]).toString();
  };

  return (
    <div className="wrap">
      <div className="phead">
        <div><p className="eyebrow">Análisis del negocio</p><h1>Reportes</h1></div>
        <div className="acts">
          <a className="btn" href={`/api/export/ventas?desde=${per.desde}&hasta=${per.hasta}`}><Icon name="download" />Ventas CSV</a>
        </div>
      </div>
      <div className="filters">
        <div className="seg">
          {PRESETS.map(([k, l]) => (
            <Link key={k} href={qs({ p: k })} className={`seg-a ${per.preset === k ? "on" : ""}`}>{l}</Link>
          ))}
        </div>
        <form className="row gap wrapf" action="/reportes">
          <input type="hidden" name="tab" value={tab} />
          <input type="date" name="desde" defaultValue={per.desde} style={{ width: "auto" }} aria-label="Desde" />
          <span className="muted">a</span>
          <input type="date" name="hasta" defaultValue={per.hasta} style={{ width: "auto" }} aria-label="Hasta" />
          <button className="btn">Aplicar</button>
        </form>
      </div>
      <div className="seg">
        {TABS.map(([k, l]) => <Link key={k} href={qs({ tab: k })} className={`seg-a ${tab === k ? "on" : ""}`}>{l}</Link>)}
      </div>
      {tab === "resumen" && <Resumen tid={s.tid} tz={tz} desde={per.desde} hasta={per.hasta} rango={rango} />}
      {tab === "ventas" && <Ventas tid={s.tid} tz={tz} rango={rango} />}
      {tab === "productos" && <Productos tid={s.tid} rango={rango} />}
      {tab === "cortes" && <Cortes tid={s.tid} tz={tz} rango={rango} />}
    </div>
  );
}

type R = { gte: Date; lt: Date };

async function Resumen({ tid, tz, desde, hasta, rango }: { tid: string; tz: string; desde: string; hasta: string; rango: R }) {
  const vs = await prisma.venta.findMany({
    where: { tenantId: tid, creado: rango },
    select: { total: true, costo: true, metodo: true, estado: true, creado: true, usuarioNombre: true, caja: { select: { nombre: true } } },
  });
  const ok = vs.filter((v) => v.estado === "PAGADA");
  const canc = vs.filter((v) => v.estado === "CANCELADA");
  const [pagos, devs] = await Promise.all([
    prisma.ventaPago.groupBy({ by: ["metodo"], where: { venta: { tenantId: tid, estado: "PAGADA", creado: rango } }, _sum: { monto: true }, _count: true }),
    prisma.devolucion.aggregate({ where: { tenantId: tid, creado: rango }, _sum: { total: true }, _count: true }),
  ]);
  const devTotal = n(devs._sum.total);
  const tot = ok.reduce((a, v) => a + n(v.total), 0);
  const cost = ok.reduce((a, v) => a + n(v.costo), 0);
  const nd = Math.round((Date.parse(hasta) - Date.parse(desde)) / 864e5) + 1;
  let serie: { l: string; v: number }[];
  if (nd <= 45) {
    serie = Array.from({ length: nd }, (_, i) => {
      const d = addDays(desde, i);
      const dt = new Date(d + "T12:00:00Z");
      return {
        l: nd <= 8 ? dt.toLocaleDateString("es-MX", { weekday: "short", day: "numeric", timeZone: "UTC" }) : String(dt.getUTCDate()),
        v: ok.filter((v) => ymdIn(tz, v.creado) === d).reduce((a, v) => a + n(v.total), 0),
      };
    });
  } else {
    const m = new Map<string, number>();
    ok.forEach((v) => { const k = ymdIn(tz, v.creado).slice(0, 7); m.set(k, (m.get(k) ?? 0) + n(v.total)); });
    serie = [...m.entries()].sort().map(([l, v]) => ({ l, v }));
  }
  const grp = (f: (v: (typeof ok)[number]) => string) => {
    const m = new Map<string, { v: number; c: number }>();
    ok.forEach((v) => { const k = f(v); const x = m.get(k) ?? { v: 0, c: 0 }; x.v += n(v.total); x.c++; m.set(k, x); });
    return [...m.entries()].map(([l, x]) => ({ l, v: r2(x.v), s: `${x.c} ${x.c === 1 ? "ticket" : "tickets"}` })).sort((a, b) => b.v - a.v);
  };
  const hour = (d: Date) => Number(new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", hourCycle: "h23" }).format(d));
  const hm = new Map<number, number>();
  ok.forEach((v) => { const h = hour(v.creado); hm.set(h, (hm.get(h) ?? 0) + n(v.total)); });
  const hs = [...hm.keys()];
  const horas = hs.length ? Array.from({ length: Math.max(...hs) - Math.min(...hs) + 1 }, (_, i) => { const h = Math.min(...hs) + i; return { l: `${h}h`, v: hm.get(h) ?? 0 }; }) : [];

  return (
    <>
      <div className="kpis">
        <div className="kpi"><span className="lbl">Ventas</span><strong className="val">{money(tot)}</strong><span className="sub">{ok.length} {ok.length === 1 ? "ticket" : "tickets"}</span></div>
        <div className="kpi"><span className="lbl">Utilidad bruta</span><strong className="val">{money(tot - cost)}</strong><span className="sub">{tot ? Math.round(((tot - cost) / tot) * 100) : 0}% de margen</span></div>
        <div className="kpi"><span className="lbl">Ticket promedio</span><strong className="val">{money(ok.length ? tot / ok.length : 0)}</strong><span className="sub">&nbsp;</span></div>
        <div className="kpi"><span className="lbl">Devoluciones y cancelaciones</span><strong className="val">{money(devTotal + canc.reduce((a, v) => a + n(v.total), 0))}</strong><span className="sub">{devs._count} devoluciones · {canc.length} cancelaciones</span></div>
      </div>
      <section className="panel"><h3>Ventas por {nd <= 45 ? "día" : "mes"}</h3><BarChart data={serie} /></section>
      <div className="grid3">
        <section className="panel"><h3>Por método de pago</h3><HBars rows={pagos.map((p) => ({ l: METODOS[p.metodo], v: n(p._sum.monto), s: `${p._count} ${p._count === 1 ? "pago" : "pagos"}` })).sort((a, b) => b.v - a.v)} /></section>
        <section className="panel"><h3>Por caja</h3><HBars rows={grp((v) => v.caja.nombre)} /></section>
        <section className="panel"><h3>Por usuario</h3><HBars rows={grp((v) => v.usuarioNombre)} /></section>
      </div>
      {horas.length > 0 && <section className="panel"><h3>Horas de mayor venta</h3><BarChart data={horas} /></section>}
    </>
  );
}

async function Ventas({ tid, tz, rango }: { tid: string; tz: string; rango: R }) {
  const vs = await prisma.venta.findMany({ where: { tenantId: tid, creado: rango }, orderBy: { creado: "desc" }, take: 500, include: { caja: { select: { nombre: true } } } });
  if (!vs.length) return <div className="panel"><Empty icon="cart" title="No hay ventas en este periodo" /></div>;
  return (
    <>
      {vs.length === 500 && <p className="muted">Se muestran las 500 más recientes. Descarga el CSV para verlas todas.</p>}
      <div className="tbl cards">
        <table>
          <thead><tr><th>Folio</th><th>Fecha</th><th>Caja</th><th>Usuario</th><th>Método</th><th className="num">Total</th><th>Estado</th></tr></thead>
          <tbody>
            {vs.map((v) => (
              <tr key={v.id}>
                <td className="first mono"><Link className="link" href={`/ventas/${v.id}`}>{v.folio}</Link></td>
                <td data-l="Fecha">{fmtDT(v.creado, tz)}</td>
                <td data-l="Caja">{v.caja.nombre}</td>
                <td data-l="Usuario">{v.usuarioNombre}</td>
                <td data-l="Método">{METODOS[v.metodo]}</td>
                <td data-l="Total" className="num">{money(v.total)}</td>
                <td data-l="Estado">{v.estado === "CANCELADA" ? <span className="pill bad">Cancelada</span> : <span className="pill ok">Pagada</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

async function Productos({ tid, rango }: { tid: string; rango: R }) {
  const [items, prods, sm] = await Promise.all([
    prisma.ventaItem.findMany({
      where: { venta: { tenantId: tid, estado: "PAGADA", creado: rango } },
      select: { productoId: true, cantidad: true, devuelto: true, importe: true, costo: true },
    }),
    prisma.producto.findMany({ where: { tenantId: tid }, select: { id: true, nombre: true, costo: true, activo: true, esServicio: true, unidad: true } }),
    stockMap(tid),
  ]);
  // Neto de devoluciones: lo devuelto no cuenta como vendido.
  const agg = new Map<string, { c: number; v: number; k: number }>();
  for (const i of items) {
    const cant = n(i.cantidad), net = cant - n(i.devuelto);
    if (net <= 0) continue;
    const x = agg.get(i.productoId) ?? { c: 0, v: 0, k: 0 };
    x.c += net; x.v += (n(i.importe) * net) / cant; x.k += n(i.costo) * net;
    agg.set(i.productoId, x);
  }
  const costoPor = new Map([...agg].map(([id, x]) => [id, x.k]));
  const pm = new Map(prods.map((p) => [p.id, p]));
  const rows = [...agg].map(([id, x]) => ({ id, nombre: pm.get(id)?.nombre ?? "—", c: x.c, v: r2(x.v) })).sort((a, b) => b.v - a.v);
  const vendidos = new Set(rows.map((r) => r.id));
  const quietos = prods.filter((p) => p.activo && !p.esServicio && !vendidos.has(p.id) && (sm.get(p.id) ?? 0) > 0)
    .map((p) => ({ ...p, stock: sm.get(p.id) ?? 0 }))
    .sort((a, b) => b.stock * n(b.costo) - a.stock * n(a.costo))
    .slice(0, 15);
  return (
    <>
      <section className="panel">
        <h3>Más vendidos</h3>
        {rows.length ? (
          <div className="tbl cards">
            <table>
              <thead><tr><th>Producto</th><th className="num">Unidades</th><th className="num">Importe</th><th className="num">Utilidad</th><th className="num">Existencia</th></tr></thead>
              <tbody>
                {rows.slice(0, 50).map((r) => (
                  <tr key={r.id}>
                    <td className="first"><b>{r.nombre}</b></td>
                    <td data-l="Unidades" className="num">{qty(r.c)}</td>
                    <td data-l="Importe" className="num">{money(r.v)}</td>
                    <td data-l="Utilidad" className="num">{money(r.v - (costoPor.get(r.id) ?? 0))}</td>
                    <td data-l="Existencia" className="num">{pm.get(r.id)?.esServicio ? "—" : qty(sm.get(r.id) ?? 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <Empty icon="chart" title="Sin ventas en el periodo" />}
      </section>
      <section className="panel">
        <h3>Con existencia y sin ventas en el periodo</h3>
        {quietos.length ? (
          <div className="list">
            {quietos.map((p) => (
              <div key={p.id} className="li">
                <div className="t"><b>{p.nombre}</b><small>{qty(p.stock)} {p.unidad} · inmovilizado {money(p.stock * n(p.costo))} a costo</small></div>
              </div>
            ))}
          </div>
        ) : <Empty icon="check" title="Todo lo que tiene existencia se vendió" />}
      </section>
    </>
  );
}

async function Cortes({ tid, tz, rango }: { tid: string; tz: string; rango: R }) {
  const ts = await prisma.turno.findMany({ where: { tenantId: tid, abiertoEn: rango }, orderBy: { abiertoEn: "desc" }, include: { caja: { select: { nombre: true } } } });
  if (!ts.length) return <div className="panel"><Empty icon="cash" title="Sin turnos de caja en el periodo" /></div>;
  const ventas = await prisma.venta.groupBy({ by: ["turnoId"], where: { tenantId: tid, estado: "PAGADA", turnoId: { in: ts.map((t) => t.id) } }, _sum: { total: true } });
  const vm = new Map(ventas.map((v) => [v.turnoId, n(v._sum.total)]));
  return (
    <div className="tbl cards">
      <table>
        <thead><tr><th>Caja</th><th>Apertura</th><th>Cierre</th><th className="num">Ventas</th><th className="num">Esperado</th><th className="num">Contado</th><th className="num">Diferencia</th><th></th></tr></thead>
        <tbody>
          {ts.map((t) => {
            const dif = n(t.diferencia);
            return (
              <tr key={t.id}>
                <td className="first"><b>{t.caja.nombre}</b> <small className="muted">{t.abiertoPor}</small></td>
                <td data-l="Apertura">{fmtDT(t.abiertoEn, tz)}</td>
                <td data-l="Cierre">{t.cerradoEn ? `${fmtDT(t.cerradoEn, tz)} · ${t.cerradoPor}` : <span className="pill ok">Abierta</span>}</td>
                <td data-l="Ventas" className="num">{money(vm.get(t.id) ?? 0)}</td>
                <td data-l="Esperado" className="num">{t.esperado != null ? money(t.esperado) : "—"}</td>
                <td data-l="Contado" className="num">{t.contado != null ? money(t.contado) : "—"}</td>
                <td data-l="Diferencia" className="num" style={{ color: dif < 0 ? "var(--bad)" : dif > 0 ? "var(--warn)" : undefined }}>{t.diferencia != null ? money(dif) : "—"}</td>
                <td>{t.estado === "CERRADO" && <a className="btn-icon sm" href={`/imprimir/corte/${t.id}`} target="_blank" aria-label="Imprimir corte"><Icon name="printer" /></a>}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
