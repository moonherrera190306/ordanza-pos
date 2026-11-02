"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { cancelarVenta } from "@/app/actions/venta";
import { Icon } from "@/components/Icon";
import { Modal, ModalHead, toast } from "@/components/ui";

export function CancelarVenta({ id, folio }: { id: string; folio: string }) {
  const [open, setOpen] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <>
      <button className="btn ghost danger" onClick={() => setOpen(true)}><Icon name="undo" />Cancelar venta</button>
      <Modal open={open} onClose={() => setOpen(false)} size="sm" label="Cancelar venta">
        <ModalHead title={`Cancelar ${folio}`} onClose={() => setOpen(false)} />
        <p className="muted">La existencia regresa al inventario y la venta deja de contar en reportes.</p>
        <label className="fld"><span>Motivo</span><input value={motivo} onChange={(e) => setMotivo(e.target.value)} autoFocus placeholder="Devolución, error de captura…" /></label>
        <div className="mfoot">
          <button className="btn" onClick={() => setOpen(false)}>Volver</button>
          <button className="btn danger" disabled={pending || !motivo.trim()} onClick={() => start(async () => {
            const r = await cancelarVenta(id, motivo);
            if (!r.ok) return toast(r.error, "bad");
            toast(r.msg ?? "Venta cancelada");
            setOpen(false);
            router.refresh();
          })}>{pending ? "Cancelando…" : "Cancelar venta"}</button>
        </div>
      </Modal>
    </>
  );
}
