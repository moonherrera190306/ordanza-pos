import { notFound } from "next/navigation";
import { requirePage } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { METODOS, money } from "@/lib/format";
import { PrintBar } from "../../PrintBar";
import { calcResumen } from "@/lib/corte";

export const metadata = { title: "Corte de caja" };

export default async function Corte({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ auto?: string }> }) {
  const s = await requirePage(["ADMIN", "CAJERO"]);
  const { id } = await params;
  const { auto } = await searchParams;
  const t = await prisma.turno.findFirst({ where: { id, tenantId: s.tid }, include: { caja: true } });
  if (!t) notFound();
  const r = await calcResumen(t.id, s.tid);
  const tz = s.tenant.zonaHoraria;
  const f = (d: Date | null) => (d ? d.toLocaleString("es-MX", { timeZone: tz, day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "—");
  const w = s.tenant.anchoTicket === 80 ? 72 : 48;
  return (
    <>
      <PrintBar auto={auto === "1"} />
      <div className="paper" style={{ width: `${w}mm` }}>
        <div className="c"><b className="big">{s.tenant.nombre}</b><div><b>CORTE DE CAJA</b></div></div>
        <hr />
        <div className="r"><span>Caja</span><span>{t.caja.nombre}</span></div>
        <div className="r"><span>Apertura</span><span>{f(t.abiertoEn)}</span></div>
        <div className="r"><span>Abrió</span><span>{t.abiertoPor}</span></div>
        <div className="r"><span>Cierre</span><span>{f(t.cerradoEn)}</span></div>
        <div className="r"><span>Cerró</span><span>{t.cerradoPor ?? "—"}</span></div>
        <hr />
        <div className="r"><span>Tickets</span><span>{r.tickets}{r.cancelados ? ` (+${r.cancelados} canc.)` : ""}</span></div>
        {(Object.keys(METODOS) as (keyof typeof METODOS)[]).map((m) => <div className="r" key={m}><span>{METODOS[m]}</span><span>{money(r.porMetodo[m])}</span></div>)}
        <div className="r"><b>Total vendido</b><b>{money(r.total)}</b></div>
        <hr />
        <div className="r"><span>Fondo inicial</span><span>{money(r.fondo)}</span></div>
        <div className="r"><span>+ Ventas en efectivo</span><span>{money(r.porMetodo.EFECTIVO)}</span></div>
        {r.abonosEfectivo > 0 && <div className="r"><span>+ Abonos clientes</span><span>{money(r.abonosEfectivo)}</span></div>}
        {r.entradas > 0 && <div className="r"><span>+ Entradas</span><span>{money(r.entradas)}</span></div>}
        {r.retiros > 0 && <div className="r"><span>− Retiros</span><span>{money(r.retiros)}</span></div>}
        {r.devolucionesEfectivo > 0 && <div className="r"><span>− Devoluciones</span><span>{money(r.devolucionesEfectivo)}</span></div>}
        <div className="r"><span>Efectivo esperado</span><span>{money(t.esperado ?? r.esperado)}</span></div>
        <div className="r"><span>Efectivo contado</span><span>{money(t.contado)}</span></div>
        <div className="r big"><span>Diferencia</span><span>{money(t.diferencia)}</span></div>
        {t.nota && <><hr /><div>Notas: {t.nota}</div></>}
        <hr />
        <div className="c" style={{ marginTop: 18 }}>Firma: ____________________</div>
      </div>
    </>
  );
}
