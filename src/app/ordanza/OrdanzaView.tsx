"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { actualizarLicencia, crearNegocio } from "@/app/actions/ordanza";
import { generarLicencia } from "@/app/actions/licencia";
import { money, norm } from "@/lib/format";
import { Icon } from "@/components/Icon";
import { Modal, ModalHead, Toaster, toast } from "@/components/ui";

type Neg = {
  id: string; nombre: string; slug: string; plan: string; maxCajas: number; activo: boolean; notas: string; pagadoHasta: string | null; creado: string;
  ventas30: number; tickets30: number; ultimaVenta: string | null; cajas: number; usuarios: number;
};
const PLANES = ["Básico", "Operación", "Multi-sucursal", "Demo"];
const fd = (s: string | null) => (s ? new Date(s).toLocaleDateString("es-MX", { day: "numeric", month: "short", year: "numeric" }) : "—");

function estado(n: Neg, hoy: number) {
  if (!n.activo) return <span className="pill bad">Suspendido</span>;
  if (!n.pagadoHasta) return <span className="pill nodot">Sin fecha</span>;
  const dias = Math.ceil((Date.parse(n.pagadoHasta) - hoy) / 864e5);
  if (dias < 0) return <span className="pill bad">Vencido hace {-dias} d</span>;
  if (dias <= 7) return <span className="pill warn">Vence en {dias} d</span>;
  return <span className="pill ok">Al corriente</span>;
}

export function OrdanzaView({ negocios, hoy }: { negocios: Neg[]; hoy: string }) {
  const [q, setQ] = useState("");
  const [nuevo, setNuevo] = useState(false);
  const [edit, setEdit] = useState<Neg | null>(null);
  const [gen, setGen] = useState(false);
  const now = Date.parse(hoy);
  const list = useMemo(() => negocios.filter((x) => norm(`${x.nombre} ${x.slug} ${x.plan}`).includes(norm(q))), [negocios, q]);
  const activos = negocios.filter((x) => x.activo);
  const vencidos = activos.filter((x) => x.pagadoHasta && Date.parse(x.pagadoHasta) < now);
  const porVencer = activos.filter((x) => x.pagadoHasta && Date.parse(x.pagadoHasta) >= now && Date.parse(x.pagadoHasta) - now <= 7 * 864e5);
  const sinUso = activos.filter((x) => !x.ultimaVenta || now - Date.parse(x.ultimaVenta) > 14 * 864e5);

  return (
    <div className="wrap">
      <div className="phead">
        <div><p className="eyebrow">Licencias y clientes</p><h1>Negocios</h1></div>
        <div className="acts"><button className="btn" onClick={() => setGen(true)}><Icon name="key" />Licencia local</button><button className="btn primary" onClick={() => setNuevo(true)}><Icon name="plus" />Nuevo negocio</button></div>
      </div>
      <div className="kpis">
        <div className="kpi"><span className="lbl">Negocios activos</span><strong className="val">{activos.length}</strong><span className="sub">{negocios.length - activos.length} {negocios.length - activos.length === 1 ? "suspendido" : "suspendidos"}</span></div>
        <div className="kpi"><span className="lbl">Pago vencido</span><strong className="val">{vencidos.length}</strong><span className="sub">{porVencer.length} vencen esta semana</span></div>
        <div className="kpi"><span className="lbl">Sin ventas en 14 días</span><strong className="val">{sinUso.length}</strong><span className="sub">riesgo de cancelación</span></div>
        <div className="kpi"><span className="lbl">Cajas en uso</span><strong className="val">{activos.reduce((a, x) => a + x.cajas, 0)}</strong><span className="sub">&nbsp;</span></div>
      </div>
      <div className="filters"><div className="pos-search sm"><Icon name="search" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar negocio" /></div></div>
      <div className="tbl cards">
        <table>
          <thead><tr><th>Negocio</th><th>Plan</th><th>Licencia</th><th className="num">Cajas</th><th className="num">Usuarios</th><th className="num">Ventas 30 d</th><th>Última venta</th><th></th></tr></thead>
          <tbody>
            {list.map((x) => (
              <tr key={x.id}>
                <td className="first"><b>{x.nombre}</b><div className="muted mono" style={{ fontSize: ".76rem" }}>{x.slug} · alta {fd(x.creado)}</div></td>
                <td data-l="Plan">{x.plan}</td>
                <td data-l="Licencia">{estado(x, now)}<div className="muted" style={{ fontSize: ".76rem" }}>{x.pagadoHasta ? `hasta ${fd(x.pagadoHasta)}` : ""}</div></td>
                <td data-l="Cajas" className="num">{x.cajas}/{x.maxCajas}</td>
                <td data-l="Usuarios" className="num">{x.usuarios}</td>
                <td data-l="Ventas 30 d" className="num">{money(x.ventas30)}<div className="muted" style={{ fontSize: ".76rem" }}>{x.tickets30} tickets</div></td>
                <td data-l="Última venta">{fd(x.ultimaVenta)}</td>
                <td><div className="row-acts">
                  <a className="btn-icon sm" href={`/api/ordanza/respaldo/${x.id}`} title="Descargar respaldo" aria-label={`Respaldo de ${x.nombre}`}><Icon name="download" /></a>
                  <button className="btn-icon sm" onClick={() => setEdit(x)} aria-label={`Editar licencia de ${x.nombre}`}><Icon name="edit" /></button>
                </div></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {nuevo && <NuevoNegocio onClose={() => setNuevo(false)} />}
      {edit && <Licencia neg={edit} onClose={() => setEdit(null)} />}
      {gen && <GenerarLicencia onClose={() => setGen(false)} />}
      <Toaster />
    </div>
  );
}

function NuevoNegocio({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const mes = new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10);
  const [f, setF] = useState({ negocio: "", admin: "", email: "", password: "", pin: "", plan: "Básico", maxCajas: "2", pagadoHasta: mes });
  const [pending, start] = useTransition();
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF((x) => ({ ...x, [k]: e.target.value }));
  return (
    <Modal open onClose={onClose} label="Nuevo negocio">
      <form style={{ display: "flex", flexDirection: "column", gap: 14 }} onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await crearNegocio({ ...f, maxCajas: Number(f.maxCajas) || 1 });
          if (!r.ok) return toast(r.error, "bad");
          toast(`${f.negocio} listo. El administrador entra con ${f.email}.`); onClose(); router.refresh();
        });
      }}>
        <ModalHead title="Nuevo negocio" eyebrow="Se crea con su administrador y la Caja 1" onClose={onClose} />
        <label className="fld"><span>Nombre del negocio</span><input value={f.negocio} onChange={set("negocio")} autoFocus /></label>
        <div className="grid2">
          <label className="fld"><span>Administrador</span><input value={f.admin} onChange={set("admin")} placeholder="Nombre del dueño o encargado" /></label>
          <label className="fld"><span>Correo para entrar</span><input type="email" value={f.email} onChange={set("email")} /></label>
        </div>
        <div className="grid2">
          <label className="fld"><span>Contraseña inicial</span><input value={f.password} onChange={set("password")} autoComplete="new-password" /></label>
          <label className="fld"><span>PIN inicial</span><input className="mono" inputMode="numeric" maxLength={6} value={f.pin} onChange={set("pin")} /></label>
        </div>
        <div className="grid3">
          <label className="fld"><span>Plan</span><select value={f.plan} onChange={set("plan")}>{PLANES.map((p) => <option key={p}>{p}</option>)}</select></label>
          <label className="fld"><span>Cajas incluidas</span><input className="mono" inputMode="numeric" value={f.maxCajas} onChange={set("maxCajas")} /></label>
          <label className="fld"><span>Pagado hasta</span><input type="date" value={f.pagadoHasta} onChange={set("pagadoHasta")} /></label>
        </div>
        <div className="mfoot"><button type="button" className="btn" onClick={onClose}>Cancelar</button><button className="btn primary" disabled={pending}>Crear negocio</button></div>
      </form>
    </Modal>
  );
}

function Licencia({ neg, onClose }: { neg: Neg; onClose: () => void }) {
  const router = useRouter();
  const [f, setF] = useState({ plan: neg.plan, maxCajas: String(neg.maxCajas), pagadoHasta: neg.pagadoHasta?.slice(0, 10) ?? "", activo: neg.activo, notas: neg.notas });
  const [pending, start] = useTransition();
  const extender = (dias: number) => {
    const base = f.pagadoHasta && Date.parse(f.pagadoHasta) > Date.now() ? Date.parse(f.pagadoHasta) : Date.now();
    setF((x) => ({ ...x, pagadoHasta: new Date(base + dias * 864e5).toISOString().slice(0, 10) }));
  };
  return (
    <Modal open onClose={onClose} label="Licencia">
      <form style={{ display: "flex", flexDirection: "column", gap: 14 }} onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await actualizarLicencia({ id: neg.id, ...f, maxCajas: Number(f.maxCajas) || 1 });
          if (!r.ok) return toast(r.error, "bad");
          toast(r.msg!); onClose(); router.refresh();
        });
      }}>
        <ModalHead title={neg.nombre} eyebrow="Licencia" onClose={onClose} />
        <div className="grid2">
          <label className="fld"><span>Plan</span><select value={f.plan} onChange={(e) => setF({ ...f, plan: e.target.value })}>{[...new Set([f.plan, ...PLANES])].map((p) => <option key={p}>{p}</option>)}</select></label>
          <label className="fld"><span>Cajas incluidas</span><input className="mono" inputMode="numeric" value={f.maxCajas} onChange={(e) => setF({ ...f, maxCajas: e.target.value })} /></label>
        </div>
        <label className="fld"><span>Pagado hasta</span>
          <div className="inrow"><input type="date" value={f.pagadoHasta} onChange={(e) => setF({ ...f, pagadoHasta: e.target.value })} />
            <button type="button" className="btn" onClick={() => extender(30)}>+1 mes</button><button type="button" className="btn" onClick={() => extender(365)}>+1 año</button></div>
        </label>
        <label className="fld"><span>Notas internas</span><input value={f.notas} onChange={(e) => setF({ ...f, notas: e.target.value })} placeholder="Contacto, forma de pago, acuerdos…" /></label>
        <label className="chk"><input type="checkbox" checked={f.activo} onChange={(e) => setF({ ...f, activo: e.target.checked })} /> Cuenta activa (si la desactivas, nadie del negocio puede entrar)</label>
        <div className="mfoot"><button type="button" className="btn" onClick={onClose}>Cancelar</button><button className="btn primary" disabled={pending}>Guardar</button></div>
      </form>
    </Modal>
  );
}

function GenerarLicencia({ onClose }: { onClose: () => void }) {
  const [f, setF] = useState({ negocio: "", equipo: "", cajas: "1" });
  const [clave, setClave] = useState("");
  const [pending, start] = useTransition();
  const copiar = async () => { try { await navigator.clipboard.writeText(clave); toast("Clave copiada"); } catch { toast("Selecciona la clave y cópiala", "warn"); } };
  return (
    <Modal open onClose={onClose} label="Licencia local">
      <ModalHead title="Licencia de la versión local" eyebrow="Pago único · se amarra a la computadora del cliente" onClose={onClose} />
      {!clave ? (
        <form style={{ display: "flex", flexDirection: "column", gap: 14 }} onSubmit={(e) => {
          e.preventDefault();
          start(async () => {
            const r = await generarLicencia({ negocio: f.negocio, equipo: f.equipo, cajas: Number(f.cajas) || 1 });
            if (!r.ok) return toast(r.error, "bad");
            setClave(r.data!);
          });
        }}>
          <label className="fld"><span>Negocio</span><input value={f.negocio} onChange={(e) => setF({ ...f, negocio: e.target.value })} autoFocus /></label>
          <div className="grid2">
            <label className="fld"><span>Código de equipo (lo ve el cliente en Ajustes)</span><input className="mono" value={f.equipo} onChange={(e) => setF({ ...f, equipo: e.target.value.toUpperCase() })} placeholder="1A2B-3C4D-5E6F-7A8B" /></label>
            <label className="fld"><span>Cajas pagadas</span><input className="mono" inputMode="numeric" value={f.cajas} onChange={(e) => setF({ ...f, cajas: e.target.value })} /></label>
          </div>
          <div className="mfoot"><button type="button" className="btn" onClick={onClose}>Cancelar</button><button className="btn primary" disabled={pending}>Generar clave</button></div>
        </form>
      ) : (
        <>
          <p className="muted">Mándasela al cliente. Se pega en Ajustes → Licencia → Activar.</p>
          <textarea className="mono" readOnly rows={5} value={clave} onFocus={(e) => e.target.select()} style={{ fontSize: ".78rem" }} />
          <div className="mfoot"><button className="btn" onClick={() => setClave("")}>Otra</button><button className="btn primary" onClick={copiar}><Icon name="copy" />Copiar clave</button></div>
        </>
      )}
    </Modal>
  );
}
