import { notFound } from "next/navigation";
import { requirePage } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { METODOS, money, n, qty } from "@/lib/format";
import { PrintBar } from "../../PrintBar";
import { Barcode } from "../../Barcode";

export const metadata = { title: "Ticket" };

export default async function Ticket({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ auto?: string }> }) {
  const s = await requirePage();
  const { id } = await params;
  const { auto } = await searchParams;
  const v = await prisma.venta.findFirst({ where: { id, tenantId: s.tid }, include: { items: true, caja: true } });
  if (!v) notFound();
  const t = s.tenant;
  const w = t.anchoTicket === 80 ? 72 : 48;
  const fecha = v.creado.toLocaleString("es-MX", { timeZone: t.zonaHoraria });
  return (
    <>
      <PrintBar auto={auto === "1"} />
      <div className="paper" style={{ width: `${w}mm` }}>
        <div className="c"><b className="big">{t.nombre}</b>{t.rfc && <div>RFC {t.rfc}</div>}{t.direccion && <div>{t.direccion}</div>}{t.telefono && <div>Tel. {t.telefono}</div>}</div>
        <hr />
        <div className="r"><span>Folio</span><b>{v.folio}</b></div>
        <div>{fecha}</div>
        <div className="r"><span>{v.caja.nombre}</span><span>Atendió: {v.usuarioNombre.split(" ")[0]}</span></div>
        {v.cliente && <div>Cliente: {v.cliente}</div>}
        <hr />
        {v.items.map((i) => (
          <div key={i.id}>
            <div>{i.nombre}</div>
            <div className="r"><span>{qty(i.cantidad)} x {money(i.precio)}</span><span>{money(i.importe)}</span></div>
          </div>
        ))}
        <hr />
        <div className="r"><span>Subtotal</span><span>{money(v.subtotal)}</span></div>
        {n(v.descuento) > 0 && <div className="r"><span>Descuento</span><span>-{money(v.descuento)}</span></div>}
        <div className="r"><span>IVA incluido</span><span>{money(v.iva)}</span></div>
        <div className="r big"><span>TOTAL</span><span>{money(v.total)}</span></div>
        <div className="r"><span>{METODOS[v.metodo]}</span><span>{money(v.recibido)}</span></div>
        {v.metodo === "EFECTIVO" && <div className="r"><span>Cambio</span><span>{money(v.cambio)}</span></div>}
        {v.estado === "CANCELADA" && <><hr /><div className="c big">*** CANCELADA ***</div></>}
        <hr />
        <div className="c">{t.piePagina}</div>
        <Barcode value={v.folio} height={34} fontSize={11} width={1.3} />
      </div>
    </>
  );
}
