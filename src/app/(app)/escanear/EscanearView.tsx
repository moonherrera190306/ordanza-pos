"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { buscarGlobal, porCodigo, type Hit } from "@/app/actions/buscar";
import { detalleProducto, type DetalleProducto } from "@/app/actions/catalogo";
import { Icon } from "@/components/Icon";
import { Empty, toast } from "@/components/ui";
import { CameraScanner, beep, useScanner } from "@/components/scanner";
import { StockPill, Thumb } from "@/components/Thumb";
import { Barcode } from "@/app/imprimir/Barcode";
import { MOV_TIPOS, money, qty } from "@/lib/format";
import { addToLabels } from "../etiquetas/queue";

export function EscanearView({ rol, tz, initialId, camara }: { rol: string; tz: string; initialId: string | null; camara: boolean }) {
  const router = useRouter();
  const [cam, setCam] = useState(camara);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [p, setP] = useState<DetalleProducto | null>(null);
  const canEdit = rol !== "CAJERO";

  const open = useCallback(async (id: string) => {
    const r = await detalleProducto(id);
    if (!r.ok) return toast(r.error, "bad");
    setP(r.data!);
    setQ("");
    window.scrollTo(0, 0);
  }, []);

  const byCode = useCallback(async (code: string) => {
    const id = await porCodigo(code);
    if (id) { beep(true); open(id); }
    else {
      beep(false);
      setP(null);
      if (canEdit) router.push(`/productos?nuevo=1&codigo=${encodeURIComponent(code)}`);
      else toast(`Código ${code} no registrado`, "warn");
    }
  }, [open, canEdit, router]);

  useScanner(byCode, !cam);
  useEffect(() => { if (initialId) open(initialId); }, [initialId, open]);
  useEffect(() => {
    if (!q.trim()) { setHits([]); return; }
    const t = setTimeout(() => buscarGlobal(q).then((h) => setHits(h.filter((x) => x.kind === "producto"))), 180);
    return () => clearTimeout(t);
  }, [q]);

  return (
    <div className="wrap narrow">
      <div className="scan-hero">
        <button className="scan-btn" onClick={() => setCam(true)}>
          <span className="sb-ic"><Icon name="camera" /></span>
          <span><b>Escanear con la cámara</b><small>Apunta al código de barras. Con lector USB o Bluetooth solo escanea.</small></span>
        </button>
        <div className="pos-search">
          <Icon name="search" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="O escribe nombre, código o SKU" enterKeyHint="search"
            onKeyDown={(e) => { if (e.key === "Enter" && q.trim()) { e.preventDefault(); byCode(q.trim()); } }} />
        </div>
      </div>

      {q.trim() ? (
        hits.length ? (
          <div className="panel"><div className="list">
            {hits.map((h) => h.kind === "producto" && (
              <div key={h.id} className="li" style={{ cursor: "pointer" }} onClick={() => open(h.id)}>
                <Thumb nombre={h.nombre} categoria={h.categoria} />
                <div className="t"><b>{h.nombre}</b><small className="mono">{money(h.precio)}</small></div>
                <StockPill p={{ esServicio: h.esServicio, stock: h.stock, minimo: 0 }} />
              </div>
            ))}
          </div></div>
        ) : <div className="panel"><Empty icon="search" title={`No encontré productos con “${q}”`} /></div>
      ) : p ? (
        <>
          <article className="pd">
            <div className="pd-img"><Thumb nombre={p.nombre} categoria={p.categoria} size="pd-fill" /></div>
            <div className="pd-body">
              <div className="row gap"><p className="eyebrow grow">{p.categoria || "Sin categoría"}</p><button className="btn-icon sm" onClick={() => setP(null)} aria-label="Cerrar"><Icon name="x" /></button></div>
              <h2 style={{ fontSize: "1.5rem" }}>{p.nombre}</h2>
              <div className="pd-price">{money(p.precio)}<small className="muted" style={{ fontSize: ".9rem", fontFamily: "var(--f-body)" }}> / {p.unidad}</small></div>
              <div className="pd-meta">
                <StockPill p={p} />
                {p.ubicacion && <span className="pill acc nodot">{p.ubicacion}</span>}
                {p.sku && <span className="pill nodot mono">SKU {p.sku}</span>}
                {p.proveedor && <span className="pill nodot">{p.proveedor}</span>}
                {!p.activo && <span className="pill bad">No disponible</span>}
              </div>
              {p.codigo && <div className="bar"><Barcode value={p.codigo} /></div>}
              <div className="row gap wrapf">
                {rol !== "ALMACEN" && <Link className="btn primary" href="/venta"><Icon name="cart" />Ir a vender</Link>}
                {canEdit && <Link className="btn" href={`/inventario?p=${p.id}`}><Icon name="layers" />Entrada / salida</Link>}
                {canEdit && p.codigo && <button className="btn" onClick={() => { addToLabels(p.id); toast("Agregado a etiquetas"); }}><Icon name="tag" />Etiqueta</button>}
              </div>
            </div>
          </article>
          <section className="panel">
            <h3>Movimientos recientes</h3>
            {p.movs.length ? (
              <div className="list">
                {p.movs.map((m) => (
                  <div key={m.id} className="li">
                    <span className={`pill ${m.cantidad < 0 ? "warn" : "ok"}`}>{MOV_TIPOS[m.tipo as keyof typeof MOV_TIPOS]}</span>
                    <div className="t"><b className="mono">{m.cantidad > 0 ? "+" : ""}{qty(m.cantidad)}</b><small>{m.usuario}{m.nota ? " · " + m.nota : ""}</small></div>
                    <span className="log-ts">{new Date(m.creado).toLocaleString("es-MX", { timeZone: tz, day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
                  </div>
                ))}
              </div>
            ) : <Empty icon="layers" title="Sin movimientos registrados" />}
          </section>
        </>
      ) : (
        <div className="panel"><Empty icon="scan" title="Escanea o busca un producto">Verás su precio, existencia, ubicación y últimos movimientos.</Empty></div>
      )}
      <CameraScanner open={cam} onClose={() => setCam(false)} onCode={(c) => { setCam(false); byCode(c); }} />
    </div>
  );
}
