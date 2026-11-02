"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { moverInventario } from "@/app/actions/catalogo";
import type { ProductoDTO } from "@/lib/stock";
import { MOV_TIPOS, money, parseNum, qty } from "@/lib/format";
import { Icon } from "@/components/Icon";
import { Empty, toast } from "@/components/ui";
import { ProductPicker } from "@/components/ProductPicker";
import { Thumb } from "@/components/Thumb";
import { beep, useScanner } from "@/components/scanner";

type Mov = { id: string; tipo: string; cantidad: number; producto: string; usuario: string; nota: string | null; creado: string };
type Tipo = "ENTRADA" | "SALIDA" | "AJUSTE";

export function InventarioView({ productos, movs, tipo, initialId, tz }: { productos: ProductoDTO[]; movs: Mov[]; tipo: string; initialId: string | null; tz: string }) {
  const router = useRouter();
  const [t, setT] = useState<Tipo>("ENTRADA");
  const [sel, setSel] = useState<string | null>(initialId);
  const [cant, setCant] = useState("");
  const [nota, setNota] = useState("");
  const [pending, start] = useTransition();
  const cantRef = useRef<HTMLInputElement>(null);
  const p = productos.find((x) => x.id === sel);

  const pick = (id: string) => { setSel(id); beep(true); setTimeout(() => cantRef.current?.focus(), 30); };
  useScanner((code) => {
    const x = productos.find((y) => y.codigo === code || y.sku?.toLowerCase() === code.toLowerCase());
    if (x) pick(x.id); else { beep(false); toast(`Código ${code} no registrado`, "warn"); }
  });

  const k = useMemo(() => {
    const a = productos.filter((x) => x.activo);
    return {
      n: a.length,
      u: a.reduce((s, x) => s + Math.max(0, x.stock), 0),
      costo: a.reduce((s, x) => s + Math.max(0, x.stock) * x.costo, 0),
      venta: a.reduce((s, x) => s + Math.max(0, x.stock) * x.precio, 0),
    };
  }, [productos]);

  const apply = () => {
    if (!p) return toast("Primero elige un producto", "warn");
    if (cant === "") return toast("Escribe la cantidad", "warn");
    start(async () => {
      const r = await moverInventario({ productoId: p.id, tipo: t, cantidad: parseNum(cant), nota });
      if (!r.ok) return toast(r.error, "bad");
      toast(`${p.nombre}: ahora hay ${qty(r.data)} ${p.unidad}`);
      setCant(""); setNota(""); setSel(null);
      router.refresh();
    });
  };

  return (
    <div className="wrap">
      <div className="phead">
        <div><p className="eyebrow">Existencias</p><h1>Inventario</h1></div>
        <div className="acts"><a className="btn" href="/api/export/movimientos"><Icon name="download" />Movimientos CSV</a></div>
      </div>
      <div className="kpis">
        <div className="kpi"><span className="lbl">Valor a costo</span><strong className="val">{money(k.costo)}</strong><span className="sub">{k.n} productos</span></div>
        <div className="kpi"><span className="lbl">Valor a precio de venta</span><strong className="val">{money(k.venta)}</strong></div>
        <div className="kpi"><span className="lbl">Unidades</span><strong className="val">{qty(k.u)}</strong></div>
        <div className="kpi"><span className="lbl">Utilidad potencial</span><strong className="val">{money(k.venta - k.costo)}</strong></div>
      </div>
      <div className="grid3">
        <section className="panel">
          <h3>Registrar movimiento</h3>
          <div className="seg">
            {(["ENTRADA", "SALIDA", "AJUSTE"] as Tipo[]).map((x) => (
              <button key={x} className={x === t ? "on" : ""} onClick={() => setT(x)}>{x === "AJUSTE" ? "Conteo físico" : MOV_TIPOS[x]}</button>
            ))}
          </div>
          <ProductPicker productos={productos} onPick={(x) => pick(x.id)} placeholder="Escanea o busca el producto" />
          {p && (
            <div className="li" style={{ border: "1px solid var(--line)", borderRadius: 12, padding: 10 }}>
              <Thumb nombre={p.nombre} categoria={p.categoria} />
              <div className="t"><b>{p.nombre}</b><small>Existencia actual {qty(p.stock)} {p.unidad}</small></div>
              <button className="x" onClick={() => setSel(null)} aria-label="Quitar"><Icon name="x" /></button>
            </div>
          )}
          <label className="fld"><span>{t === "AJUSTE" ? "Existencia contada" : "Cantidad"}</span>
            <input ref={cantRef} className="mono" inputMode="decimal" value={cant} onChange={(e) => setCant(e.target.value)} onKeyDown={(e) => e.key === "Enter" && apply()} />
          </label>
          {t === "AJUSTE" && p && cant !== "" && (
            <p className="muted" style={{ fontSize: ".86rem" }}>Diferencia: <b className="mono">{(parseNum(cant) - p.stock > 0 ? "+" : "") + qty(parseNum(cant) - p.stock)}</b></p>
          )}
          <label className="fld"><span>Nota</span><input value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Factura, proveedor, motivo" /></label>
          <button className="btn primary" disabled={pending} onClick={apply}><Icon name="check" />{pending ? "Aplicando…" : "Aplicar"}</button>
        </section>
        <section className="panel span2">
          <div className="panel-h">
            <h3>Historial de movimientos</h3>
            <select value={tipo} onChange={(e) => router.push(e.target.value ? `/inventario?tipo=${e.target.value}` : "/inventario")} style={{ width: "auto" }} aria-label="Tipo">
              <option value="">Todos</option>
              {Object.entries(MOV_TIPOS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
          </div>
          {movs.length ? (
            <div className="list">
              {movs.map((m) => (
                <div key={m.id} className="li">
                  <span className={`pill ${m.cantidad < 0 ? "warn" : m.tipo === "AJUSTE" ? "acc" : "ok"}`}>{MOV_TIPOS[m.tipo as keyof typeof MOV_TIPOS]}</span>
                  <div className="t"><b>{m.producto}</b><small>{m.usuario}{m.nota ? " · " + m.nota : ""}</small></div>
                  <b className="mono">{m.cantidad > 0 ? "+" : ""}{qty(m.cantidad)}</b>
                  <span className="log-ts">{new Date(m.creado).toLocaleString("es-MX", { timeZone: tz, day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
                </div>
              ))}
            </div>
          ) : <Empty icon="layers" title="Aún no hay movimientos" />}
        </section>
      </div>
    </div>
  );
}
