"use client";

import { useEffect, useState, useTransition } from "react";
import { buscarVentaParaDevolver, devolver, type VentaParaDevolver } from "@/app/actions/venta";
import { METODOS, money, parseNum, qty, r2, r3 } from "@/lib/format";
import { Icon } from "./Icon";
import { Modal, ModalHead, toast } from "./ui";
import { PinSupervisor } from "./Supervisor";

type Metodo = keyof typeof METODOS;

/** Devolución parcial o total de un ticket. */
export function DevolucionModal({ folio: folio0 = "", needPin, onClose, onDone }: { folio?: string; needPin: boolean; onClose: () => void; onDone?: () => void }) {
  const [folio, setFolio] = useState(folio0);
  const [v, setV] = useState<VentaParaDevolver | null>(null);
  const [cant, setCant] = useState<Record<string, string>>({});
  const [metodo, setMetodo] = useState<Metodo>("EFECTIVO");
  const [motivo, setMotivo] = useState("");
  const [pin, setPin] = useState("");
  const [pending, start] = useTransition();

  const buscar = (f = folio) => start(async () => {
    const r = await buscarVentaParaDevolver(f);
    if (!r.ok) return toast(r.error, "bad");
    setV(r.data!);
    setCant({});
    const m = r.data!.pagos.reduce((a, p) => (p.monto > a.monto ? p : a), r.data!.pagos[0]);
    setMetodo(m?.metodo === "CREDITO" ? "CREDITO" : (m?.metodo as Metodo) ?? "EFECTIVO");
  });
  useEffect(() => { if (folio0) buscar(folio0); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const lines = v ? v.items.map((i) => ({ i, c: Math.min(i.disponible, Math.max(0, parseNum(cant[i.id] ?? ""))) })).filter((x) => x.c > 0) : [];
  const total = v ? r2(lines.reduce((a, x) => a + x.i.precio * x.c * v.factor, 0)) : 0;

  const ok = () => start(async () => {
    if (!v) return;
    const r = await devolver({ ventaId: v.id, items: lines.map((x) => ({ ventaItemId: x.i.id, cant: r3(x.c) })), metodo, motivo, autPin: needPin ? pin : undefined });
    if (!r.ok) return toast(r.error, "bad");
    toast(`Devolución registrada · ${money(r.data!.total)}${metodo === "EFECTIVO" ? " en efectivo" : ""}`);
    onDone?.();
    onClose();
  });

  return (
    <Modal open onClose={onClose} size="lg" label="Devolución">
      <ModalHead title="Devolución" eyebrow={v ? `Ticket ${v.folio}${v.cliente ? " · " + v.cliente : ""}` : "Busca el ticket"} onClose={onClose} />
      {!v ? (
        <form className="row gap" onSubmit={(e) => { e.preventDefault(); buscar(); }}>
          <div className="pos-search sm grow"><Icon name="search" /><input value={folio} onChange={(e) => setFolio(e.target.value)} placeholder="Escanea o escribe el folio, ej. C1-000123" autoFocus /></div>
          <button className="btn primary" disabled={pending || !folio.trim()}>Buscar</button>
        </form>
      ) : (
        <>
          <div className="tbl">
            <table>
              <thead><tr><th>Producto</th><th className="num">Vendido</th><th className="num">Ya devuelto</th><th className="num">Devolver</th></tr></thead>
              <tbody>
                {v.items.map((i) => (
                  <tr key={i.id}>
                    <td><b>{i.nombre}</b><div className="muted mono" style={{ fontSize: ".78rem" }}>{money(i.precio)} / {i.unidad}</div></td>
                    <td className="num">{qty(i.cantidad)}</td>
                    <td className="num">{i.devuelto ? qty(i.devuelto) : "—"}</td>
                    <td className="num">
                      {i.disponible > 0 ? (
                        <div className="row" style={{ gap: 6, justifyContent: "flex-end" }}>
                          <input className="mono" inputMode="decimal" style={{ width: 80, textAlign: "right" }} value={cant[i.id] ?? ""} placeholder="0"
                            onChange={(e) => setCant((c) => ({ ...c, [i.id]: e.target.value }))} aria-label={`Cantidad a devolver de ${i.nombre}`} />
                          <button type="button" className="btn sm" onClick={() => setCant((c) => ({ ...c, [i.id]: String(i.disponible) }))}>Todo</button>
                        </div>
                      ) : <span className="pill nodot">Devuelto</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="fld">
            <span>Regresar el dinero en</span>
            <div className="seg">
              {(["EFECTIVO", "TARJETA", "TRANSFERENCIA", ...(v.clienteId ? ["CREDITO"] : [])] as Metodo[]).map((m) => (
                <button key={m} type="button" className={metodo === m ? "on" : ""} onClick={() => setMetodo(m)}>{m === "CREDITO" ? "Abono a su cuenta" : METODOS[m]}</button>
              ))}
            </div>
          </div>
          <label className="fld"><span>Motivo</span><input value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Defecto, cambio de talla, error de cobro…" /></label>
          {needPin && <PinSupervisor value={pin} onChange={setPin} />}
          <div className="change"><span>A devolver{metodo === "EFECTIVO" ? " en efectivo" : ""}</span><b className="mono">{money(total)}</b></div>
          <div className="mfoot">
            <button type="button" className="btn" onClick={() => setV(null)}>Otro ticket</button>
            <button className="btn primary" disabled={pending || !lines.length || motivo.trim().length < 2 || (needPin && pin.length < 4)} onClick={ok}>
              <Icon name="undo" />{pending ? "Registrando…" : "Registrar devolución"}
            </button>
          </div>
        </>
      )}
    </Modal>
  );
}
