"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { desvincularEquipo, guardarCaja, guardarNegocio, guardarUsuario, vincularEquipo } from "@/app/actions/ajustes";
import { initials, parseNum, ROLES } from "@/lib/format";
import { Icon } from "@/components/Icon";
import { Modal, ModalHead, toast } from "@/components/ui";

type Negocio = { nombre: string; rfc: string; direccion: string; telefono: string; piePagina: string; anchoTicket: 58 | 80; ivaPct: number; permitirSinStock: boolean; autorizarDescuento: boolean; autorizarRetiro: boolean; autorizarDevolucion: boolean };
type Licencia = { plan: string; maxCajas: number; pagadoHasta: string | null };
type Caja = { id: string; nombre: string; clave: string; activa: boolean; abiertaPor: string | null };
type Rol = "ADMIN" | "CAJERO" | "ALMACEN";
type Usuario = { id: string; nombre: string; rol: Rol; email: string; activo: boolean; tienePassword: boolean };

export function AjustesView({ meId, negocio, cajas, usuarios, equipoCajaId, licencia, superAdmin }: { meId: string; negocio: Negocio; cajas: Caja[]; usuarios: Usuario[]; equipoCajaId: string | null; licencia: Licencia; superAdmin: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [f, setF] = useState(negocio);
  const [caja, setCaja] = useState<Caja | "new" | null>(null);
  const [user, setUser] = useState<Usuario | "new" | null>(null);
  const [vinc, setVinc] = useState(equipoCajaId ?? cajas.find((c) => c.activa)?.id ?? "");
  const set = <K extends keyof Negocio>(k: K, v: Negocio[K]) => setF((x) => ({ ...x, [k]: v }));
  const equipo = cajas.find((c) => c.id === equipoCajaId);
  const act = (p: Promise<{ ok: boolean; error?: string; msg?: string }>, after?: () => void) =>
    start(async () => {
      const r = await p;
      if (!r.ok) return toast(r.error!, "bad");
      if (r.msg) toast(r.msg);
      after?.();
      router.refresh();
    });

  return (
    <div className="wrap">
      <div className="phead"><div><p className="eyebrow">Administración</p><h1>Ajustes</h1></div></div>

      <form className="panel set-card" onSubmit={(e) => { e.preventDefault(); act(guardarNegocio(f)); }}>
        <div className="panel-h"><h3>Negocio y ticket</h3></div>
        <div className="form-grid">
          <label className="fld"><span>Nombre del negocio</span><input value={f.nombre} onChange={(e) => set("nombre", e.target.value)} /></label>
          <label className="fld"><span>RFC</span><input className="mono" value={f.rfc} maxLength={13} onChange={(e) => set("rfc", e.target.value.toUpperCase())} /></label>
          <label className="fld"><span>Dirección</span><input value={f.direccion} onChange={(e) => set("direccion", e.target.value)} /></label>
          <label className="fld"><span>Teléfono</span><input inputMode="tel" value={f.telefono} onChange={(e) => set("telefono", e.target.value)} /></label>
          <label className="fld"><span>Mensaje al pie del ticket</span><input value={f.piePagina} onChange={(e) => set("piePagina", e.target.value)} /></label>
          <label className="fld"><span>Ancho del ticket</span>
            <select value={f.anchoTicket} onChange={(e) => set("anchoTicket", Number(e.target.value) === 80 ? 80 : 58)}><option value={58}>58 mm</option><option value={80}>80 mm</option></select>
          </label>
          <label className="fld"><span>IVA incluido en precios (%)</span><input className="mono" inputMode="decimal" value={f.ivaPct} onChange={(e) => set("ivaPct", parseNum(e.target.value))} /></label>
        </div>
        <label className="chk"><input type="checkbox" checked={f.permitirSinStock} onChange={(e) => set("permitirSinStock", e.target.checked)} /> Permitir vender productos sin existencia</label>
        <div className="panel-h" style={{ marginTop: 8 }}><h3>Autorizaciones para cajeros</h3></div>
        <p className="muted" style={{ fontSize: ".86rem", marginTop: -6 }}>Cuando está activo, un cajero necesita el PIN de un administrador. Queda registrado quién autorizó.</p>
        <label className="chk"><input type="checkbox" checked={f.autorizarDescuento} onChange={(e) => set("autorizarDescuento", e.target.checked)} /> Descuentos</label>
        <label className="chk"><input type="checkbox" checked={f.autorizarRetiro} onChange={(e) => set("autorizarRetiro", e.target.checked)} /> Retiros de efectivo</label>
        <label className="chk"><input type="checkbox" checked={f.autorizarDevolucion} onChange={(e) => set("autorizarDevolucion", e.target.checked)} /> Devoluciones</label>
        <div className="mfoot"><button className="btn primary" disabled={pending}>Guardar</button></div>
      </form>

      <section className="panel set-card">
        <div className="panel-h"><h3>Este equipo</h3></div>
        {equipo ? (
          <div className="dev">
            <Icon name="link" />
            <div className="t"><b>Vinculado a {equipo.nombre}</b><small>Tu equipo entra con selección de usuario y PIN, sin correo.</small></div>
            <button className="btn sm" disabled={pending} onClick={() => act(desvincularEquipo())}>Desvincular</button>
          </div>
        ) : (
          <p className="muted">Vincula la computadora o tablet de cada caja. Después, los cajeros solo eligen su nombre y escriben su PIN.</p>
        )}
        <div className="row gap wrapf">
          <select value={vinc} onChange={(e) => setVinc(e.target.value)} style={{ width: "auto", minWidth: 180 }} aria-label="Caja para este equipo">
            {cajas.filter((c) => c.activa).map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </select>
          <button className="btn" disabled={pending || !vinc} onClick={() => act(vincularEquipo(vinc))}><Icon name="link" />{equipo ? "Cambiar caja" : "Vincular este equipo"}</button>
        </div>
      </section>

      <div className="grid2">
        <section className="panel">
          <div className="panel-h"><h3>Cajas</h3><button className="btn sm" onClick={() => setCaja("new")}><Icon name="plus" />Caja</button></div>
          <div className="list">
            {cajas.map((c) => (
              <div key={c.id} className="li">
                <span className="av">{c.clave}</span>
                <div className="t"><b>{c.nombre}</b><small>{!c.activa ? "Desactivada" : c.abiertaPor ? `Abierta por ${c.abiertaPor}` : "Cerrada"}{c.id === equipoCajaId ? " · este equipo" : ""}</small></div>
                <button className="btn-icon sm" onClick={() => setCaja(c)} aria-label={`Editar ${c.nombre}`}><Icon name="edit" /></button>
              </div>
            ))}
          </div>
        </section>
        <section className="panel" id="usuarios">
          <div className="panel-h"><h3>Usuarios</h3><button className="btn sm" onClick={() => setUser("new")}><Icon name="plus" />Usuario</button></div>
          <div className="list">
            {usuarios.map((u) => (
              <div key={u.id} className="li">
                <span className="av">{initials(u.nombre)}</span>
                <div className="t">
                  <b>{u.nombre}{u.id === meId && <span className="pill acc nodot" style={{ marginLeft: 6 }}>Tú</span>}</b>
                  <small>{ROLES[u.rol]}{u.email ? ` · ${u.email}` : ""}{!u.activo ? " · desactivado" : ""}</small>
                </div>
                <button className="btn-icon sm" onClick={() => setUser(u)} aria-label={`Editar ${u.nombre}`}><Icon name="edit" /></button>
              </div>
            ))}
          </div>
        </section>
      </div>

      <div className="grid2">
        <section className="panel">
          <div className="panel-h"><h3>Tu plan</h3><span className="pill acc nodot">{licencia.plan}</span></div>
          <div className="list">
            <div className="li"><div className="t"><b>Cajas activas</b><small>{cajas.filter((c) => c.activa).length} de {licencia.maxCajas} incluidas</small></div></div>
            <div className="li"><div className="t"><b>Vigencia</b><small>{licencia.pagadoHasta ? `Pagado hasta el ${new Date(licencia.pagadoHasta).toLocaleDateString("es-MX", { day: "numeric", month: "long", year: "numeric" })}` : "Sin fecha registrada"}</small></div></div>
          </div>
        </section>
        <section className="panel">
          <div className="panel-h"><h3>Tus datos</h3></div>
          <p className="muted" style={{ fontSize: ".88rem" }}>Descarga un respaldo completo de tu negocio: productos, ventas, clientes, compras y bitácora. Los datos son tuyos.</p>
          <div className="row gap wrapf">
            <a className="btn" href="/api/respaldo"><Icon name="download" />Respaldo completo (JSON)</a>
            <a className="btn" href="/api/export/productos"><Icon name="download" />Productos (CSV)</a>
            {superAdmin && <a className="btn primary" href="/ordanza"><Icon name="shield" />Panel Ordanza</a>}
          </div>
        </section>
      </div>

      {caja && <CajaForm caja={caja === "new" ? null : caja} sugerida={`C${cajas.length + 1}`} onClose={() => setCaja(null)} />}
      {user && <UsuarioForm user={user === "new" ? null : user} onClose={() => setUser(null)} />}
    </div>
  );
}

function CajaForm({ caja, sugerida, onClose }: { caja: Caja | null; sugerida: string; onClose: () => void }) {
  const router = useRouter();
  const [f, setF] = useState({ nombre: caja?.nombre ?? `Caja ${sugerida.slice(1)}`, clave: caja?.clave ?? sugerida, activa: caja?.activa ?? true });
  const [pending, start] = useTransition();
  return (
    <Modal open onClose={onClose} size="sm" label="Caja">
      <form style={{ display: "flex", flexDirection: "column", gap: 14 }} onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await guardarCaja({ id: caja?.id, ...f });
          if (!r.ok) return toast(r.error, "bad");
          toast(r.msg!); onClose(); router.refresh();
        });
      }}>
        <ModalHead title={caja ? "Editar caja" : "Nueva caja"} onClose={onClose} />
        <div className="grid2">
          <label className="fld"><span>Nombre</span><input value={f.nombre} onChange={(e) => setF({ ...f, nombre: e.target.value })} autoFocus /></label>
          <label className="fld"><span>Clave para folios</span><input className="mono" maxLength={4} value={f.clave} onChange={(e) => setF({ ...f, clave: e.target.value.toUpperCase() })} /></label>
        </div>
        <label className="chk"><input type="checkbox" checked={f.activa} onChange={(e) => setF({ ...f, activa: e.target.checked })} /> Caja activa</label>
        <div className="mfoot"><button type="button" className="btn" onClick={onClose}>Cancelar</button><button className="btn primary" disabled={pending}>Guardar</button></div>
      </form>
    </Modal>
  );
}

function UsuarioForm({ user, onClose }: { user: Usuario | null; onClose: () => void }) {
  const router = useRouter();
  const [f, setF] = useState({ nombre: user?.nombre ?? "", rol: user?.rol ?? ("CAJERO" as Rol), email: user?.email ?? "", password: "", pin: "", activo: user?.activo ?? true });
  const [pending, start] = useTransition();
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF((x) => ({ ...x, [k]: e.target.type === "checkbox" ? (e.target as HTMLInputElement).checked : e.target.value }));
  const esAdmin = f.rol === "ADMIN";
  return (
    <Modal open onClose={onClose} size="sm" label="Usuario">
      <form style={{ display: "flex", flexDirection: "column", gap: 14 }} onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await guardarUsuario({ id: user?.id, ...f });
          if (!r.ok) return toast(r.error, "bad");
          toast(r.msg!); onClose(); router.refresh();
        });
      }}>
        <ModalHead title={user ? "Editar usuario" : "Nuevo usuario"} onClose={onClose} />
        <label className="fld"><span>Nombre</span><input value={f.nombre} onChange={set("nombre")} autoFocus /></label>
        <label className="fld"><span>Rol</span>
          <select value={f.rol} onChange={set("rol")}>{(Object.keys(ROLES) as Rol[]).map((k) => <option key={k} value={k}>{ROLES[k]}</option>)}</select>
        </label>
        <p className="muted" style={{ fontSize: ".84rem" }}>Cajero: vende, consulta y agenda. Almacén: productos, inventario y etiquetas. Administrador: todo, incluidos reportes y ajustes.</p>
        <label className="fld"><span>{user ? "Nuevo PIN (vacío para no cambiarlo)" : "PIN de 4 a 6 dígitos"}</span><input className="mono" inputMode="numeric" type="password" maxLength={6} value={f.pin} onChange={set("pin")} autoComplete="new-password" /></label>
        {(esAdmin || f.email) && (
          <>
            <label className="fld"><span>Correo{esAdmin ? "" : " (opcional)"}</span><input type="email" value={f.email} onChange={set("email")} /></label>
            <label className="fld"><span>{user?.tienePassword ? "Nueva contraseña (vacía para no cambiarla)" : "Contraseña (mínimo 8)"}</span><input type="password" value={f.password} onChange={set("password")} autoComplete="new-password" /></label>
          </>
        )}
        {user && <label className="chk"><input type="checkbox" checked={f.activo} onChange={set("activo")} /> Usuario activo</label>}
        <div className="mfoot"><button type="button" className="btn" onClick={onClose}>Cancelar</button><button className="btn primary" disabled={pending}>Guardar</button></div>
      </form>
    </Modal>
  );
}
