"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { eliminarProducto, generarCodigo, guardarProducto } from "@/app/actions/catalogo";
import type { ProductoDTO } from "@/lib/stock";
import { parseNum, qty } from "@/lib/format";
import { Icon } from "./Icon";
import { Modal, ModalHead, toast } from "./ui";
import { CameraScanner } from "./scanner";

const UNIDADES = ["pza", "kg", "g", "lt", "ml", "m", "caja", "paquete", "servicio"];

export function ProductoForm({ producto, preset, categorias, canDelete, onClose }: {
  producto?: ProductoDTO | null; preset?: { codigo?: string }; categorias: string[]; canDelete: boolean; onClose: () => void;
}) {
  const router = useRouter();
  const p = producto;
  const [f, setF] = useState({
    nombre: p?.nombre ?? "", codigo: p?.codigo ?? preset?.codigo ?? "", sku: p?.sku ?? "", categoria: p?.categoria ?? "",
    unidad: p?.unidad ?? "pza", precio: p ? String(p.precio) : "", costo: p ? String(p.costo) : "", minimo: p ? String(p.minimo) : "0",
    stockInicial: "0", proveedor: p?.proveedor ?? "", ubicacion: p?.ubicacion ?? "", activo: p?.activo ?? true,
  });
  const [cam, setCam] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const [pending, start] = useTransition();
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setF((x) => ({ ...x, [k]: e.target.type === "checkbox" ? (e.target as HTMLInputElement).checked : e.target.value }));
  const pr = parseNum(f.precio), co = parseNum(f.costo);
  const margen = pr && co ? Math.round(((pr - co) / pr) * 100) : null;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!f.nombre.trim()) return toast("El nombre es obligatorio", "warn");
    if (f.precio === "") return toast("Escribe el precio", "warn");
    start(async () => {
      const r = await guardarProducto({
        id: p?.id, nombre: f.nombre, codigo: f.codigo, sku: f.sku, categoria: f.categoria, unidad: f.unidad,
        precio: pr, costo: co, minimo: parseNum(f.minimo), stockInicial: p ? undefined : parseNum(f.stockInicial),
        proveedor: f.proveedor, ubicacion: f.ubicacion, activo: f.activo,
      });
      if (!r.ok) return toast(r.error, "bad");
      toast(r.msg!);
      router.refresh();
      onClose();
    });
  };

  return (
    <Modal open onClose={onClose} size="lg" label="Producto">
      <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <ModalHead title={p ? "Editar producto" : "Nuevo producto"} onClose={onClose} />
        <div className="pf-grid">
          <label className="fld span2"><span>Nombre *</span><input value={f.nombre} onChange={set("nombre")} autoFocus /></label>
          <label className="fld span2"><span>Código de barras</span>
            <div className="inrow">
              <input className="mono" value={f.codigo} onChange={set("codigo")} placeholder="Escanéalo aquí con el lector" onKeyDown={(e) => e.key === "Enter" && e.preventDefault()} />
              <button type="button" className="btn-icon" onClick={() => setCam(true)} title="Leer con cámara" aria-label="Leer código con cámara"><Icon name="camera" /></button>
              <button type="button" className="btn" onClick={async () => { const c = await generarCodigo(); setF((x) => ({ ...x, codigo: c })); }}>Generar</button>
            </div>
          </label>
          <label className="fld"><span>Categoría</span>
            <input list="catList" value={f.categoria} onChange={set("categoria")} />
            <datalist id="catList">{categorias.map((c) => <option key={c} value={c} />)}</datalist>
          </label>
          <label className="fld"><span>SKU / clave interna</span><input className="mono" value={f.sku} onChange={set("sku")} /></label>
          <label className="fld"><span>Precio de venta (IVA incluido) *</span><input className="mono" inputMode="decimal" value={f.precio} onChange={set("precio")} /></label>
          <label className="fld"><span>Costo {margen != null && <small className="muted" style={{ fontWeight: 500 }}>· margen {margen}%</small>}</span><input className="mono" inputMode="decimal" value={f.costo} onChange={set("costo")} /></label>
          <label className="fld"><span>Unidad</span><select value={f.unidad} onChange={set("unidad")}>{UNIDADES.map((u) => <option key={u}>{u}</option>)}</select></label>
          {p ? (
            <div className="fld"><span>Existencia</span><div className="static mono">{qty(p.stock)} <small>se ajusta en Inventario</small></div></div>
          ) : (
            <label className="fld"><span>Existencia inicial</span><input className="mono" inputMode="decimal" value={f.stockInicial} onChange={set("stockInicial")} disabled={f.unidad === "servicio"} /></label>
          )}
          <label className="fld"><span>Stock mínimo</span><input className="mono" inputMode="decimal" value={f.minimo} onChange={set("minimo")} /></label>
          <label className="fld"><span>Proveedor</span><input value={f.proveedor} onChange={set("proveedor")} /></label>
          <label className="fld span2"><span>Ubicación</span><input value={f.ubicacion} onChange={set("ubicacion")} placeholder="Pasillo 2, anaquel B" /></label>
          <label className="chk span2"><input type="checkbox" checked={f.activo} onChange={set("activo")} /> Disponible para venta</label>
        </div>
        <div className="mfoot">
          {p && canDelete && <button type="button" className="btn ghost danger" onClick={() => setConfirmDel(true)}><Icon name="trash" />Eliminar</button>}
          <span className="grow" />
          <button type="button" className="btn" onClick={onClose}>Cancelar</button>
          <button className="btn primary" disabled={pending}>{pending ? "Guardando…" : "Guardar"}</button>
        </div>
      </form>
      <CameraScanner open={cam} onClose={() => setCam(false)} onCode={(c) => { setCam(false); setF((x) => ({ ...x, codigo: c })); }} />
      {confirmDel && p && (
        <Modal open onClose={() => setConfirmDel(false)} size="sm" label="Eliminar">
          <ModalHead title={`¿Eliminar ${p.nombre}?`} onClose={() => setConfirmDel(false)} />
          <p className="muted">Si ya tiene ventas registradas, solo se desactiva para conservar el historial.</p>
          <div className="mfoot">
            <button className="btn" onClick={() => setConfirmDel(false)}>Cancelar</button>
            <button className="btn danger" onClick={() => start(async () => {
              const r = await eliminarProducto(p.id);
              if (!r.ok) return toast(r.error, "bad");
              toast(r.data === "desactivado" ? "Tiene ventas: se desactivó en lugar de borrarse" : "Producto eliminado");
              router.refresh();
              onClose();
            })}>Eliminar</button>
          </div>
        </Modal>
      )}
    </Modal>
  );
}
