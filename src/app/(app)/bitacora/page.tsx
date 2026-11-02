import Link from "next/link";
import { requirePage } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { fmtDT, rangeOf, ymdIn } from "@/lib/dates";
import { initials } from "@/lib/format";
import { periodo } from "@/lib/periodo";
import { Icon } from "@/components/Icon";
import { Empty } from "@/components/ui";

export const metadata = { title: "Bitácora" };
const PAGE = 100;

type SP = { u?: string; m?: string; q?: string; desde?: string; hasta?: string; pag?: string };

export default async function Bitacora({ searchParams }: { searchParams: Promise<SP> }) {
  const s = await requirePage(["ADMIN"]);
  const sp = await searchParams;
  const tz = s.tenant.zonaHoraria;
  const per = periodo(ymdIn(tz), { ...sp, p: "30d" });
  const pag = Math.max(1, Number(sp.pag) || 1);
  const where = {
    tenantId: s.tid,
    creado: rangeOf(tz, per.desde, per.hasta),
    ...(sp.u ? { usuarioNombre: sp.u } : {}),
    ...(sp.m ? { modulo: sp.m } : {}),
    ...(sp.q ? { OR: [{ accion: { contains: sp.q, mode: "insensitive" as const } }, { detalle: { contains: sp.q, mode: "insensitive" as const } }] } : {}),
  };
  const [rows, total, usuarios, modulos] = await Promise.all([
    prisma.bitacora.findMany({ where, orderBy: { creado: "desc" }, take: PAGE, skip: (pag - 1) * PAGE }),
    prisma.bitacora.count({ where }),
    prisma.bitacora.findMany({ where: { tenantId: s.tid }, distinct: ["usuarioNombre"], select: { usuarioNombre: true }, orderBy: { usuarioNombre: "asc" } }),
    prisma.bitacora.findMany({ where: { tenantId: s.tid }, distinct: ["modulo"], select: { modulo: true }, orderBy: { modulo: "asc" } }),
  ]);
  const pages = Math.max(1, Math.ceil(total / PAGE));
  const link = (p: number) => "?" + new URLSearchParams(Object.entries({ ...sp, desde: per.desde, hasta: per.hasta, pag: String(p) }).filter(([, v]) => v) as [string, string][]).toString();

  return (
    <div className="wrap">
      <div className="phead">
        <div><p className="eyebrow">Quién hizo qué y cuándo</p><h1>Bitácora</h1></div>
        <div className="acts"><a className="btn" href={`/api/export/bitacora?desde=${per.desde}&hasta=${per.hasta}`}><Icon name="download" />Exportar CSV</a></div>
      </div>
      <form className="filters" action="/bitacora">
        <div className="pos-search sm"><Icon name="search" /><input name="q" defaultValue={sp.q} placeholder="Buscar en acciones y detalles" /></div>
        <select name="u" defaultValue={sp.u ?? ""} aria-label="Usuario">
          <option value="">Todos los usuarios</option>
          {usuarios.map((u) => <option key={u.usuarioNombre}>{u.usuarioNombre}</option>)}
        </select>
        <select name="m" defaultValue={sp.m ?? ""} aria-label="Módulo">
          <option value="">Todos los módulos</option>
          {modulos.map((m) => <option key={m.modulo}>{m.modulo}</option>)}
        </select>
        <input type="date" name="desde" defaultValue={per.desde} style={{ width: "auto" }} aria-label="Desde" />
        <input type="date" name="hasta" defaultValue={per.hasta} style={{ width: "auto" }} aria-label="Hasta" />
        <button className="btn primary">Filtrar</button>
      </form>
      <section className="panel">
        {rows.length ? (
          <div className="list">
            {rows.map((r) => (
              <div key={r.id} className="li">
                <span className="av" style={{ width: 32, height: 32, fontSize: ".78rem" }}>{initials(r.usuarioNombre)}</span>
                <div className="t">
                  <b>{r.accion} <span className="pill nodot" style={{ marginLeft: 4 }}>{r.modulo}</span></b>
                  <small>{r.usuarioNombre}{r.detalle ? ` · ${r.detalle}` : ""}</small>
                </div>
                <span className="log-ts">{fmtDT(r.creado, tz)}</span>
              </div>
            ))}
          </div>
        ) : <Empty icon="list" title="Sin registros con estos filtros" />}
      </section>
      {pages > 1 && (
        <div className="row gap" style={{ justifyContent: "center" }}>
          {pag > 1 && <Link className="btn sm" href={link(pag - 1)}>Anterior</Link>}
          <span className="muted">Página {pag} de {pages}</span>
          {pag < pages && <Link className="btn sm" href={link(pag + 1)}>Siguiente</Link>}
        </div>
      )}
    </div>
  );
}
