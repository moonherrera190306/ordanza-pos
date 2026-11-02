"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { abonar } from "@/app/actions/clientes";
import { METODOS, money, parseNum } from "@/lib/format";
import { Icon } from "@/components/Icon";
import { Modal, ModalHead, toast } from "@/components/ui";
import { ClienteForm, type ClienteRow } from "../ClientesView";

export function ClienteAcciones({ cliente, esAdmin, cajaAbierta }: { cliente: ClienteRow; esAdmin: boolean; cajaAbierta: boolean }) {
  const [m, setM] = useState<null | "abono" | "edit">(null);
  return (
    <div className="acts">
      <button className="btn" onClick={() => setM("edit")}><Icon name="edit" />Editar</button>
      {cliente.saldo > 0 && <button className="btn primary" onClick={() => setM("abono")}><Icon name="cash" />Registrar abono</button>}
      {m === "edit" && <ClienteForm cliente={cliente} esAdmin={esAdmin} onClose={() => setM(null)} />}
      {m === "abono" && <AbonoModal cliente={cliente} cajaAbierta={cajaAbierta} onClose={() => setM(null)} />}
    </div>
  );
}

function AbonoModal({ cliente, cajaAbierta, onClose }: { cliente: ClienteRow; cajaAbierta: boolean; onClose: () => void }) {
  const router = useRouter();
  const [monto, setMonto] = useState("");
  const [metodo, setMetodo] = useState<"EFECTIVO" | "TARJETA" | "TRANSFERENCIA">(cajaAbierta ? "EFECTIVO" : "TRANSFERENCIA");
  const [nota, setNota] = useState("");
  const [pending, start] = useTransition();
  const v = parseNum(monto);
  return (
    <Modal open onClose={onClose} size="sm" label="Abono">
      <form style={{ display: "flex", flexDirection: "column", gap: 14 }} onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await abonar({ clienteId: cliente.id, monto: v, metodo, nota });
          if (!r.ok) return toast(r.error, "bad");
          toast(r.msg!); onClose(); router.refresh();
        });
      }}>
        <ModalHead title="Registrar abono" eyebrow={`${cliente.nombre} · debe ${money(cliente.saldo)}`} onClose={onClose} />
        <div className="seg">
          {(["EFECTIVO", "TARJETA", "TRANSFERENCIA"] as const).map((k) => <button type="button" key={k} className={metodo === k ? "on" : ""} onClick={() => setMetodo(k)}>{METODOS[k]}</button>)}
        </div>
        {metodo === "EFECTIVO" && !cajaAbierta && <p className="err">Para recibir efectivo abre la caja en Vender.</p>}
        <label className="fld"><span>Monto</span>
          <div className="inrow"><input className="mono" inputMode="decimal" value={monto} onChange={(e) => setMonto(e.target.value)} autoFocus style={{ height: 52, fontSize: "1.3rem" }} />
            <button type="button" className="btn" style={{ height: 52 }} onClick={() => setMonto(String(cliente.saldo))}>Todo</button></div>
        </label>
        <label className="fld"><span>Nota</span><input value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Opcional" /></label>
        <div className="change"><span>Saldo después del abono</span><b className="mono">{money(Math.max(0, cliente.saldo - v))}</b></div>
        <div className="mfoot"><button type="button" className="btn" onClick={onClose}>Cancelar</button><button className="btn primary" disabled={pending || v <= 0 || v > cliente.saldo + 0.001 || (metodo === "EFECTIVO" && !cajaAbierta)}>Registrar abono</button></div>
      </form>
    </Modal>
  );
}
