"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { guardarCliente } from "@/app/actions/clientes";
import { initials, money, norm, parseNum } from "@/lib/format";
import { Icon } from "@/components/Icon";
import { Empty, Modal, ModalHead, toast } from "@/components/ui";

export type ClienteRow = { id: string; nombre: string; telefono: string; email: string; rfc: string; nota: string; limite: number; saldo: number; activo: boolean; ultimo: string | null };

export function ClientesView({ clientes, esAdmin }: { clientes: ClienteRow[]; esAdmin: boolean }) {
  const [q, setQ] = useState("");
  const [f, setF] = useState<"" | "deben" | "credito">("");
  const [edit, setEdit] = useState<ClienteRow | "new" | null>(null);
  const list = useMemo(() => {
    let l = clientes;
    if (q) l = l.filter((c) => norm(`${c.nombre} ${c.telefono} ${c.rfc}`).includes(norm(q)));
    if (f === "deben") l = l.filter((c) => c.saldo > 0);
    if (f === "credito") l = l.filter((c) => c.limite > 0);
    return l;
  }, [clientes, q, f]);
  const porCobrar = clientes.reduce((a, c) => a + Math.max(0, c.saldo), 0);
  const deudores = clientes.filter((c) => c.saldo > 0).length;
  const vencidos = clientes.filter((c) => c.limite > 0 && c.saldo > c.limite).length;

  return (
    <div className="wrap">
      <div className="phead">
        <div><p className="eyebrow">Cuentas y crédito</p><h1>Clientes</h1></div>
        <div className="acts"><button className="btn primary" onClick={() => setEdit("new")}><Icon name="plus" />Nuevo cliente</button></div>
      </div>
      <div className="kpis">
        <div className="kpi"><span className="lbl">Por cobrar</span><strong className="val">{money(porCobrar)}</strong><span className="sub">{deudores} {deudores === 1 ? "cliente debe" : "clientes deben"}</span></div>
        <div className="kpi"><span className="lbl">Clientes</span><strong className="val">{clientes.filter((c) => c.activo).length}</strong><span className="sub">activos</span></div>
        <div className="kpi"><span className="lbl">Con crédito</span><strong className="val">{clientes.filter((c) => c.limite > 0).length}</strong><span className="sub">&nbsp;</span></div>
        <div className="kpi"><span className="lbl">Sobre su límite</span><strong className="val">{vencidos}</strong><span className="sub">&nbsp;</span></div>
      </div>
      <div className="filters">
        <div className="pos-search sm"><Icon name="search" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por nombre, teléfono o RFC" /></div>
        <div className="seg">
          {([["", "Todos"], ["deben", "Deben"], ["credito", "Con crédito"]] as const).map(([k, l]) => <button key={k} className={f === k ? "on" : ""} onClick={() => setF(k)}>{l}</button>)}
        </div>
      </div>
      {list.length ? (
        <div className="tbl cards">
          <table>
            <thead><tr><th>Cliente</th><th>Teléfono</th><th className="num">Saldo</th><th className="num">Límite</th><th className="num">Disponible</th><th></th></tr></thead>
            <tbody>
              {list.map((c) => (
                <tr key={c.id}>
                  <td className="first">
                    <Link href={`/clientes/${c.id}`} className="pcell" style={{ textDecoration: "none", color: "inherit" }}>
                      <span className="av">{initials(c.nombre)}</span>
                      <div><b>{c.nombre}</b><small>{!c.activo ? "Inactivo" : c.rfc || (c.ultimo ? `Último mov. ${new Date(c.ultimo).toLocaleDateString("es-MX", { day: "numeric", month: "short" })}` : "Sin movimientos")}</small></div>
                    </Link>
                  </td>
                  <td data-l="Teléfono">{c.telefono || "—"}</td>
                  <td data-l="Saldo" className="num" style={{ color: c.saldo > 0 ? (c.limite && c.saldo > c.limite ? "var(--bad)" : "var(--warn)") : undefined }}>{money(c.saldo)}</td>
                  <td data-l="Límite" className="num">{c.limite ? money(c.limite) : "Sin crédito"}</td>
                  <td data-l="Disponible" className="num">{c.limite ? money(Math.max(0, c.limite - c.saldo)) : "—"}</td>
                  <td><div className="row-acts">
                    <Link className="btn sm" href={`/clientes/${c.id}`}>{c.saldo > 0 ? "Abonar" : "Ver"}</Link>
                    <button className="btn-icon sm" onClick={() => setEdit(c)} aria-label={`Editar ${c.nombre}`}><Icon name="edit" /></button>
                  </div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <div className="panel"><Empty icon="users" title={clientes.length ? "Ningún cliente coincide" : "Aún no hay clientes"}>{!clientes.length && <span>Agrégalos aquí o desde el cobro en Vender.</span>}</Empty></div>}
      {edit && <ClienteForm cliente={edit === "new" ? null : edit} esAdmin={esAdmin} onClose={() => setEdit(null)} />}
    </div>
  );
}

export function ClienteForm({ cliente, esAdmin, onClose }: { cliente: ClienteRow | null; esAdmin: boolean; onClose: () => void }) {
  const router = useRouter();
  const [f, setF] = useState({ nombre: cliente?.nombre ?? "", telefono: cliente?.telefono ?? "", email: cliente?.email ?? "", rfc: cliente?.rfc ?? "", nota: cliente?.nota ?? "", limite: cliente?.limite ? String(cliente.limite) : "", activo: cliente?.activo ?? true });
  const [pending, start] = useTransition();
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF((x) => ({ ...x, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value }));
  return (
    <Modal open onClose={onClose} label="Cliente">
      <form style={{ display: "flex", flexDirection: "column", gap: 14 }} onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await guardarCliente({ id: cliente?.id, nombre: f.nombre, telefono: f.telefono, email: f.email, rfc: f.rfc, nota: f.nota, limiteCredito: parseNum(f.limite), activo: f.activo });
          if (!r.ok) return toast(r.error, "bad");
          toast(r.msg!); onClose(); router.refresh();
        });
      }}>
        <ModalHead title={cliente ? "Editar cliente" : "Nuevo cliente"} onClose={onClose} />
        <label className="fld"><span>Nombre</span><input value={f.nombre} onChange={set("nombre")} autoFocus /></label>
        <div className="grid2">
          <label className="fld"><span>Teléfono</span><input inputMode="tel" value={f.telefono} onChange={set("telefono")} /></label>
          <label className="fld"><span>Correo</span><input type="email" value={f.email} onChange={set("email")} /></label>
        </div>
        <div className="grid2">
          <label className="fld"><span>RFC</span><input className="mono" maxLength={13} value={f.rfc} onChange={set("rfc")} /></label>
          <label className="fld"><span>Límite de crédito</span>
            {esAdmin ? <input className="mono" inputMode="decimal" value={f.limite} onChange={set("limite")} placeholder="0 = sin crédito" />
              : <div className="static mono">{cliente?.limite ? money(cliente.limite) : "Sin crédito"} <small>lo asigna un administrador</small></div>}
          </label>
        </div>
        <label className="fld"><span>Notas</span><input value={f.nota} onChange={set("nota")} placeholder="Día de pago, referencia…" /></label>
        {cliente && <label className="chk"><input type="checkbox" checked={f.activo} onChange={set("activo")} /> Cliente activo</label>}
        <div className="mfoot"><button type="button" className="btn" onClick={onClose}>Cancelar</button><button className="btn primary" disabled={pending}>Guardar</button></div>
      </form>
    </Modal>
  );
}
