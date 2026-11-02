"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { abrirTurno } from "@/app/actions/venta";
import { Icon } from "@/components/Icon";
import { toast } from "@/components/ui";
import { parseNum } from "@/lib/format";

export function AbrirTurno({ caja }: { caja: string }) {
  const [fondo, setFondo] = useState("0");
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <div className="wrap">
      <form
        className="panel shift-card"
        onSubmit={(e) => {
          e.preventDefault();
          start(async () => {
            const r = await abrirTurno(parseNum(fondo));
            if (!r.ok) return toast(r.error, "bad");
            toast(r.msg ?? "Caja abierta");
            router.refresh();
          });
        }}
      >
        <span className="shift-ic"><Icon name="cash" /></span>
        <p className="eyebrow">{caja}</p>
        <h2>Abre la caja para vender</h2>
        <p className="muted">Cuenta el efectivo con el que inicias. Al cerrar, el corte compara lo esperado contra lo contado.</p>
        <label className="fld"><span>Fondo inicial en efectivo</span>
          <input className="mono" inputMode="decimal" value={fondo} onChange={(e) => setFondo(e.target.value)} autoFocus onFocus={(e) => e.target.select()} />
        </label>
        <button className="btn primary xl" disabled={pending}><Icon name="cash" />{pending ? "Abriendo…" : "Abrir caja"}</button>
      </form>
    </div>
  );
}
