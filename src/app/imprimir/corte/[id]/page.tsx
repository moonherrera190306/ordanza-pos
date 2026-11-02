import { notFound } from "next/navigation";
import { requirePage } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { METODOS, money, n } from "@/lib/format";
import { PrintBar } from "../../PrintBar";

export const metadata = { title: "Corte de caja" };

export default async function Corte({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ auto?: string }> }) {
  const s = await requirePage(["ADMIN", "CAJERO"]);
  const { id } = await params;
  const { auto } = await searchParams;
  const t = await prisma.turno.findFirst({ where: { id, tenantId: s.tid }, include: { caja: true } });
  if (!t) notFound();
  const g = await prisma.venta.groupBy({ by: ["metodo"], where: { turnoId: t.id, estado: "PAGADA" }, _sum: { total: true }, _count: true });
  const pm = Object.fromEntries(g.map((x) => [x.metodo, n(x._sum.total)]));
  const tickets = g.reduce((a, x) => a + x._count, 0);
  const total = Object.values(pm).reduce((a, b) => a + b, 0);
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
        <div className="r"><span>Tickets</span><span>{tickets}</span></div>
        {(Object.keys(METODOS) as (keyof typeof METODOS)[]).map((m) => <div className="r" key={m}><span>{METODOS[m]}</span><span>{money(pm[m] ?? 0)}</span></div>)}
        <div className="r"><b>Total vendido</b><b>{money(total)}</b></div>
        <hr />
        <div className="r"><span>Fondo inicial</span><span>{money(t.fondo)}</span></div>
        <div className="r"><span>Efectivo esperado</span><span>{money(t.esperado)}</span></div>
        <div className="r"><span>Efectivo contado</span><span>{money(t.contado)}</span></div>
        <div className="r big"><span>Diferencia</span><span>{money(t.diferencia)}</span></div>
        {t.nota && <><hr /><div>Notas: {t.nota}</div></>}
        <hr />
        <div className="c" style={{ marginTop: 18 }}>Firma: ____________________</div>
      </div>
    </>
  );
}
