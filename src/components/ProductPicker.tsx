"use client";

import { useMemo, useState } from "react";
import type { ProductoDTO } from "@/lib/stock";
import { norm, qty } from "@/lib/format";
import { Icon } from "./Icon";
import { CameraScanner, beep } from "./scanner";
import { toast } from "./ui";

/** Buscador con sugerencias + lector + cámara, sobre una lista de productos ya cargada. */
export function ProductPicker({ productos, onPick, placeholder }: { productos: ProductoDTO[]; onPick: (p: ProductoDTO) => void; placeholder: string }) {
  const [q, setQ] = useState("");
  const [show, setShow] = useState(false);
  const [cam, setCam] = useState(false);
  const res = useMemo(() => {
    const v = norm(q.trim());
    return v ? productos.filter((p) => norm(`${p.nombre} ${p.codigo ?? ""} ${p.sku ?? ""}`).includes(v)).slice(0, 8) : [];
  }, [q, productos]);
  const byCode = (c: string) => productos.find((p) => p.codigo === c.trim() || p.sku?.toLowerCase() === c.trim().toLowerCase());
  const pick = (p: ProductoDTO) => { onPick(p); setQ(""); setShow(false); };

  return (
    <div className="picker">
      <div className="pos-search sm">
        <Icon name="search" />
        <input value={q} placeholder={placeholder} autoComplete="off"
          onChange={(e) => { setQ(e.target.value); setShow(true); }}
          onBlur={() => setTimeout(() => setShow(false), 180)}
          onKeyDown={(e) => {
            if (e.key !== "Enter") return;
            e.preventDefault();
            const p = byCode(q) ?? (res.length === 1 ? res[0] : undefined);
            if (p) pick(p); else if (q.trim()) { beep(false); toast(`Código ${q.trim()} no registrado`, "warn"); }
          }} />
        <button type="button" className="btn-icon sm" onClick={() => setCam(true)} aria-label="Escanear con cámara"><Icon name="camera" /></button>
      </div>
      {show && q.trim() && (
        <div className="sugg">
          {res.length ? res.map((p) => (
            <button type="button" key={p.id} onMouseDown={(e) => e.preventDefault()} onClick={() => pick(p)}>
              <span>{p.nombre}</span><small className="mono">{p.codigo || p.sku || ""} · {qty(p.stock)}</small>
            </button>
          )) : <div className="empty-s">Sin coincidencias</div>}
        </div>
      )}
      <CameraScanner open={cam} onClose={() => setCam(false)} onCode={(c) => {
        setCam(false);
        const p = byCode(c);
        if (p) pick(p); else toast(`Código ${c} no registrado`, "warn");
      }} />
    </div>
  );
}
