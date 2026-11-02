import Link from "next/link";
import { requirePage } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { addDays, fmtDT, fmtLong, rangeOf, ymdIn } from "@/lib/dates";
import { firstName, money, n, qty } from "@/lib/format";
import { isLow, productosDTO } from "@/lib/stock";
import { Icon } from "@/components/Icon";
import { StockPill, Thumb } from "@/components/Thumb";
import { BarChart } from "@/components/Charts";
import { Empty } from "@/components/ui";

export const metadata = { title: "Inicio" };

function delta(a: number, b: number) {
  if (!b) return a ? <span className="up">▲ vs ayer</span> : <>sin ventas ayer</>;
  const p = Math.round(((a - b) / b) * 100);
  return <><span className={p >= 0 ? "up" : "down"}>{p >= 0 ? "▲" : "▼"} {Math.abs(p)}%</span> vs ayer</>;
}

export default async function Inicio() {
  const s = await requirePage();
  const tz = s.tenant.zonaHoraria;
  const hoy = ymdIn(tz);
  const desde7 = addDays(hoy, -6);
  const esAlmacen = s.user.rol === "ALMACEN";

  const [productos, ventas7, ayer, citas, ultimas, abiertos, conteo] = await Promise.all([
    productosDTO(s.tid, { soloActivos: true }),
    prisma.venta.findMany({ where: { tenantId: s.tid, estado: "PAGADA", creado: rangeOf(tz, desde7, hoy) }, select: { total: true, creado: true, items: { select: { cantidad: true } } } }),
    prisma.venta.aggregate({ where: { tenantId: s.tid, estado: "PAGADA", creado: rangeOf(tz, addDays(hoy, -1), addDays(hoy, -1)) }, _sum: { total: true } }),
    prisma.cita.findMany({ where: { tenantId: s.tid, fecha: hoy, estado: { not: "CANCELADA" } }, orderBy: { hora: "asc" }, take: 6 }),
    esAlmacen ? [] : prisma.venta.findMany({ where: { tenantId: s.tid, estado: "PAGADA" }, orderBy: { creado: "desc" }, take: 6, include: { caja: { select: { nombre: true } } } }),
    esAlmacen ? [] : prisma.turno.findMany({ where: { tenantId: s.tid, estado: "ABIERTO" }, include: { caja: true } }),
    s.user.rol === "ADMIN"
      ? Promise.all([prisma.usuario.count({ where: { tenantId: s.tid } }), prisma.venta.count({ where: { tenantId: s.tid } })])
      : null,
  ]);

  const deHoy = ventas7.filter((v) => ymdIn(tz, v.creado) === hoy);
  const totHoy = deHoy.reduce((a, v) => a + n(v.total), 0);
  const low = productos.filter(isLow).sort((a, b) => a.stock - b.stock);
  const dias = Array.from({ length: 7 }, (_, i) => addDays(desde7, i));
  const serie = dias.map((d) => ({
    l: new Date(d + "T12:00:00Z").toLocaleDateString("es-MX", { weekday: "short", timeZone: "UTC" }),
    v: ventas7.filter((v) => ymdIn(tz, v.creado) === d).reduce((a, v) => a + n(v.total), 0),
  }));
  const ventasTurno = abiertos.length
    ? await prisma.venta.groupBy({ by: ["turnoId"], where: { tenantId: s.tid, estado: "PAGADA", turnoId: { in: abiertos.map((t) => t.id) } }, _sum: { total: true } })
    : [];

  const fisicos = productos.filter((p) => !p.esServicio);
  const kpis = esAlmacen
    ? [
        { l: "Productos activos", v: qty(productos.length) },
        { l: "Unidades en existencia", v: qty(fisicos.reduce((a, p) => a + Math.max(0, p.stock), 0)) },
        { l: "Valor a costo", v: money(fisicos.reduce((a, p) => a + Math.max(0, p.stock) * p.costo, 0)) },
        { l: "Bajo mínimo", v: qty(low.length), href: "/productos?stock=bajo", s: "ver productos" },
      ]
    : [
        { l: "Ventas de hoy", v: money(totHoy), s: <>{deHoy.length} {deHoy.length === 1 ? "ticket" : "tickets"} · {delta(totHoy, n(ayer._sum.total))}</> },
        { l: "Ticket promedio", v: money(deHoy.length ? totHoy / deHoy.length : 0) },
        { l: "Artículos vendidos", v: qty(deHoy.reduce((a, v) => a + v.items.reduce((b, i) => b + n(i.cantidad), 0), 0)) },
        { l: "Bajo mínimo", v: qty(low.length), href: "/productos?stock=bajo", s: "ver productos" },
      ];

  const pasos = conteo
    ? [
        { ok: !!(s.tenant.rfc || s.tenant.direccion), l: "Completa los datos de tu negocio y ticket", href: "/ajustes" },
        { ok: productos.length > 0, l: "Registra tus productos", href: "/productos" },
        { ok: conteo[0] > 1, l: "Agrega a tu equipo con rol y PIN", href: "/ajustes#usuarios" },
        { ok: conteo[1] > 0, l: "Abre una caja y haz tu primera venta", href: "/venta" },
      ]
    : [];
  const hechos = pasos.filter((p) => p.ok).length;

  return (
    <div className="wrap">
      <div className="phead">
        <div><p className="eyebrow" style={{ textTransform: "capitalize" }}>{fmtLong(hoy)}</p><h1>Hola, {firstName(s.user.nombre)}</h1></div>
        <div className="acts">
          {!esAlmacen && <Link className="btn primary" href="/venta"><Icon name="cart" />Nueva venta</Link>}
          {s.user.rol !== "CAJERO" && <Link className="btn" href="/productos?nuevo=1"><Icon name="plus" />Producto</Link>}
          <Link className="btn" href="/escanear"><Icon name="scan" />Escanear</Link>
        </div>
      </div>

      {pasos.length > 0 && hechos < pasos.length && (
        <section className="onb">
          <div className="onb-h"><div><h3>Deja lista tu tienda</h3><p className="muted" style={{ fontSize: ".86rem" }}>{hechos} de {pasos.length} pasos completados</p></div></div>
          <div className="onb-bar"><i style={{ width: `${(hechos / pasos.length) * 100}%` }} /></div>
          <div className="onb-steps">
            {pasos.map((p) => (
              <Link key={p.l} href={p.href} className={`onb-s ${p.ok ? "ok" : ""}`} style={{ textDecoration: "none", color: "inherit" }}>
                <span className="onb-c">{p.ok && <Icon name="check" />}</span>{p.l}
              </Link>
            ))}
          </div>
        </section>
      )}

      <div className="kpis">
        {kpis.map((k) => {
          const body = (<><span className="lbl">{k.l}</span><strong className="val">{k.v}</strong><span className="sub">{k.s ?? " "}</span></>);
          return k.href
            ? <Link key={k.l} href={k.href} className="kpi click" style={{ textDecoration: "none", color: "inherit" }}>{body}</Link>
            : <div key={k.l} className="kpi">{body}</div>;
        })}
      </div>

      <div className="grid3">
        {!esAlmacen && (
          <section className="panel span2">
            <div className="panel-h"><h3>Ventas de los últimos 7 días</h3><span className="mono muted">{money(serie.reduce((a, d) => a + d.v, 0))}</span></div>
            <BarChart data={serie} />
          </section>
        )}
        <section className="panel">
          <div className="panel-h"><h3>Requiere atención</h3><span className={`pill ${low.length ? "warn" : "ok"}`}>{low.length}</span></div>
          {low.length ? (
            <div className="list">
              {low.slice(0, 7).map((p) => (
                <Link key={p.id} href={`/escanear?id=${p.id}`} className="li" style={{ textDecoration: "none", color: "inherit" }}>
                  <Thumb nombre={p.nombre} categoria={p.categoria} fotoUrl={p.fotoUrl} />
                  <div className="t"><b>{p.nombre}</b><small>Mínimo {qty(p.minimo)} {p.unidad}</small></div>
                  <StockPill p={p} />
                </Link>
              ))}
            </div>
          ) : <Empty icon="check" title="Todo sobre su mínimo" />}
        </section>
        <section className="panel">
          <div className="panel-h"><h3>Agenda de hoy</h3><Link className="btn sm" href="/agenda">Ver agenda</Link></div>
          {citas.length ? (
            <div className="list">
              {citas.map((c) => (
                <div key={c.id} className="li">
                  <span className="mono" style={{ fontWeight: 700, width: 48 }}>{c.hora || "--:--"}</span>
                  <div className="t"><b>{c.titulo}</b><small>{c.cliente || ""}</small></div>
                  {c.estado === "HECHA" && <span className="pill ok">Hecha</span>}
                </div>
              ))}
            </div>
          ) : <Empty icon="cal" title="Sin pendientes para hoy" />}
        </section>
        {!esAlmacen && (
          <>
            <section className="panel">
              <div className="panel-h"><h3>Últimas ventas</h3></div>
              {ultimas.length ? (
                <div className="list">
                  {ultimas.map((v) => {
                    const row = (<><div className="t"><b className="mono">{v.folio}</b><small>{v.usuarioNombre} · {v.caja.nombre} · {fmtDT(v.creado, tz)}</small></div><b className="mono">{money(v.total)}</b></>);
                    return s.user.rol === "ADMIN"
                      ? <Link key={v.id} href={`/ventas/${v.id}`} className="li" style={{ textDecoration: "none", color: "inherit" }}>{row}</Link>
                      : <div key={v.id} className="li">{row}</div>;
                  })}
                </div>
              ) : <Empty icon="cart" title="Aún no hay ventas" />}
            </section>
            <section className="panel">
              <div className="panel-h"><h3>Cajas abiertas</h3></div>
              {abiertos.length ? (
                <div className="list">
                  {abiertos.map((t) => (
                    <div key={t.id} className="li">
                      <span className="av">{t.caja.clave}</span>
                      <div className="t"><b>{t.caja.nombre}</b><small>{t.abiertoPor} · desde {fmtDT(t.abiertoEn, tz)}</small></div>
                      <span className="mono">{money(ventasTurno.find((x) => x.turnoId === t.id)?._sum.total ?? 0)}</span>
                    </div>
                  ))}
                </div>
              ) : <Empty icon="cash" title="Ninguna caja abierta" />}
            </section>
          </>
        )}
      </div>
    </div>
  );
}
