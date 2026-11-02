"use client";

import { useEffect, useState } from "react";
import type { ProductoDTO } from "@/lib/stock";
import { money } from "@/lib/format";
import { Icon } from "@/components/Icon";
import { Empty, toast } from "@/components/ui";
import { ProductPicker } from "@/components/ProductPicker";
import { beep, useScanner } from "@/components/scanner";
import { Barcode } from "@/app/imprimir/Barcode";
import { readLabels, writeLabels, type LabelQ } from "./queue";

const FORMATOS = { "50x25": "Rollo térmico 50×25 mm", "40x30": "Rollo térmico 40×30 mm", carta: "Hoja carta · 30 por hoja (3×10)" } as const;

export function EtiquetasView({ productos }: { productos: ProductoDTO[] }) {
  const [q, setQ] = useState<LabelQ>([]);
  const [fmt, setFmt] = useState<keyof typeof FORMATOS>("50x25");
  const [nombre, setNombre] = useState(true);
  const [precio, setPrecio] = useState(true);
  const byId = new Map(productos.map((p) => [p.id, p]));

  useEffect(() => { setQ(readLabels().filter((x) => byId.has(x.id))); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const save = (n: LabelQ) => { setQ(n); writeLabels(n); };
  const add = (p: ProductoDTO) => {
    if (!p.codigo) return toast(`${p.nombre} no tiene código; edítalo y genera uno`, "warn");
    beep(true);
    const l = q.find((x) => x.id === p.id);
    save(l ? q.map((x) => (x.id === p.id ? { ...x, n: x.n + 1 } : x)) : [...q, { id: p.id, n: 1 }]);
  };
  useScanner((c) => { const p = productos.find((x) => x.codigo === c); if (p) add(p); else toast(`Código ${c} no registrado`, "warn"); });

  const total = q.reduce((a, x) => a + x.n, 0);
  const print = () => {
    if (!q.length) return toast("Agrega productos primero", "warn");
    const items = q.map((x) => `${x.id}:${x.n}`).join(",");
    window.open(`/imprimir/etiquetas?f=${fmt}&n=${nombre ? 1 : 0}&p=${precio ? 1 : 0}&items=${items}`, "_blank");
  };

  return (
    <div className="wrap">
      <div className="phead">
        <div><p className="eyebrow">Código de barras CODE128</p><h1>Etiquetas</h1></div>
        <div className="acts">
          <button className="btn" onClick={() => productos.filter((p) => p.codigo && p.stock <= p.minimo && !p.esServicio).forEach(add)}>Agregar bajo mínimo</button>
          <button className="btn primary" onClick={print}><Icon name="printer" />Imprimir {total ? `(${total})` : ""}</button>
        </div>
      </div>
      <div className="grid3">
        <section className="panel">
          <h3>Productos a etiquetar</h3>
          <ProductPicker productos={productos} onPick={add} placeholder="Escanea o busca un producto" />
          {q.length ? (
            <>
              <div className="list">
                {q.map((x) => {
                  const p = byId.get(x.id)!;
                  return (
                    <div key={x.id} className="li">
                      <div className="t"><b>{p.nombre}</b><small className="mono">{p.codigo}</small></div>
                      <div className="qty">
                        <button onClick={() => save(q.map((y) => (y.id === x.id ? { ...y, n: Math.max(1, y.n - 1) } : y)))} aria-label="Menos"><Icon name="minus" /></button>
                        <input value={x.n} readOnly aria-label="Copias" />
                        <button onClick={() => save(q.map((y) => (y.id === x.id ? { ...y, n: y.n + 1 } : y)))} aria-label="Más"><Icon name="plus" /></button>
                      </div>
                      <button className="x" onClick={() => save(q.filter((y) => y.id !== x.id))} aria-label="Quitar"><Icon name="x" /></button>
                    </div>
                  );
                })}
              </div>
              <div className="row gap"><span className="muted grow">{total} etiquetas</span><button className="btn sm ghost" onClick={() => save([])}>Vaciar</button></div>
            </>
          ) : <Empty icon="tag" title="Escanea productos o agrégalos desde Productos" />}
        </section>
        <section className="panel span2">
          <div className="panel-h">
            <h3>Vista previa</h3>
            <div className="row gap wrapf">
              <select value={fmt} onChange={(e) => setFmt(e.target.value as keyof typeof FORMATOS)} style={{ width: "auto" }} aria-label="Formato">
                {Object.entries(FORMATOS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </select>
              <label className="chk"><input type="checkbox" checked={nombre} onChange={(e) => setNombre(e.target.checked)} />Nombre</label>
              <label className="chk"><input type="checkbox" checked={precio} onChange={(e) => setPrecio(e.target.checked)} />Precio</label>
            </div>
          </div>
          {q.length ? (
            <div className="lbl-grid">
              {q.slice(0, 12).map((x) => {
                const p = byId.get(x.id)!;
                return (
                  <div key={x.id} className="lab">
                    <div className="t"><span>{nombre ? p.nombre : ""}</span><span>{precio ? money(p.precio) : ""}</span></div>
                    <Barcode value={p.codigo!} height={36} fontSize={11} width={1.4} />
                  </div>
                );
              })}
            </div>
          ) : <Empty icon="tag" title="La vista previa aparece al agregar productos" />}
          <p className="muted" style={{ fontSize: ".84rem" }}>Se abre una hoja al tamaño exacto. En el diálogo de impresión elige tu impresora de etiquetas, márgenes “Ninguno” y escala 100 %.</p>
        </section>
      </div>
    </div>
  );
}
