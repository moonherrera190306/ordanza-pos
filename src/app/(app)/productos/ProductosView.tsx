"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { ProductoDTO } from "@/lib/stock";
import { money, norm } from "@/lib/format";
import { Icon } from "@/components/Icon";
import { Empty, toast } from "@/components/ui";
import { ProductoForm } from "@/components/ProductoForm";
import { StockPill, Thumb } from "@/components/Thumb";
import { useScanner } from "@/components/scanner";
import { addToLabels } from "../etiquetas/queue";

export function ProductosView({ productos, categorias, rol, initialStock, openNew }: {
  productos: ProductoDTO[]; categorias: string[]; rol: string; initialStock: string; openNew: { codigo: string } | null;
}) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("");
  const [stock, setStock] = useState(initialStock);
  const [edit, setEdit] = useState<ProductoDTO | null | "new">(openNew ? "new" : null);
  const [preset, setPreset] = useState(openNew ?? undefined);
  const canEdit = rol === "ADMIN" || rol === "ALMACEN";
  const isAdmin = rol === "ADMIN";

  useScanner((code) => {
    const p = productos.find((x) => x.codigo === code || x.sku?.toLowerCase() === code.toLowerCase());
    if (p) { if (canEdit) setEdit(p); else router.push(`/escanear?id=${p.id}`); }
    else if (canEdit) { setPreset({ codigo: code }); setEdit("new"); }
    else toast(`Código ${code} no registrado`, "warn");
  }, edit === null);

  const list = useMemo(() => {
    let l = productos;
    if (q) { const qq = norm(q); l = l.filter((p) => norm(`${p.nombre} ${p.codigo ?? ""} ${p.sku ?? ""}`).includes(qq)); }
    if (cat) l = l.filter((p) => (p.categoria || "Sin categoría") === cat);
    if (stock === "bajo") l = l.filter((p) => p.activo && !p.esServicio && p.stock <= p.minimo);
    else if (stock === "agotado") l = l.filter((p) => !p.esServicio && p.stock <= 0);
    else if (stock === "inactivo") l = l.filter((p) => !p.activo);
    return l;
  }, [productos, q, cat, stock]);

  return (
    <div className="wrap">
      <div className="phead">
        <div><p className="eyebrow">Catálogo</p><h1>Productos</h1></div>
        <div className="acts">
          {isAdmin && <a className="btn" href="/api/export/productos"><Icon name="download" />Exportar CSV</a>}
          {canEdit && <button className="btn primary" onClick={() => { setPreset(undefined); setEdit("new"); }}><Icon name="plus" />Nuevo producto</button>}
        </div>
      </div>
      <div className="filters">
        <div className="pos-search sm"><Icon name="search" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por nombre, código, SKU" /></div>
        <select value={cat} onChange={(e) => setCat(e.target.value)} aria-label="Categoría">
          <option value="">Todas las categorías</option>
          {[...new Set([...categorias, ...productos.map((p) => p.categoria || "Sin categoría")])].sort().map((c) => <option key={c}>{c}</option>)}
        </select>
        <select value={stock} onChange={(e) => setStock(e.target.value)} aria-label="Existencia">
          <option value="">Toda la existencia</option>
          <option value="bajo">Bajo mínimo</option>
          <option value="agotado">Agotados</option>
          <option value="inactivo">No disponibles</option>
        </select>
      </div>
      {list.length ? (
        <>
          <p className="muted">{list.length} productos</p>
          <div className="tbl cards">
            <table>
              <thead><tr><th>Producto</th><th>Código</th><th>Categoría</th><th className="num">Precio</th>{isAdmin && <th className="num">Costo</th>}<th>Existencia</th><th>Ubicación</th><th /></tr></thead>
              <tbody>
                {list.map((p) => (
                  <tr key={p.id}>
                    <td className="first">
                      <div className="pcell" style={{ cursor: "pointer" }} onClick={() => router.push(`/escanear?id=${p.id}`)}>
                        <Thumb nombre={p.nombre} categoria={p.categoria} fotoUrl={p.fotoUrl} />
                        <div><b>{p.nombre}</b><small>{p.sku ? `SKU ${p.sku}` : p.unidad}{!p.activo && <span className="pill bad nodot">No disponible</span>}</small></div>
                      </div>
                    </td>
                    <td data-l="Código" className="mono">{p.codigo || "—"}</td>
                    <td data-l="Categoría">{p.categoria || "—"}</td>
                    <td data-l="Precio" className="num">{money(p.precio)}</td>
                    {isAdmin && <td data-l="Costo" className="num">{money(p.costo)}</td>}
                    <td data-l="Existencia"><StockPill p={p} /></td>
                    <td data-l="Ubicación">{p.ubicacion || "—"}</td>
                    <td>
                      {canEdit && (
                        <div className="row-acts">
                          <button className="btn-icon sm" title="Agregar a etiquetas" aria-label="Agregar a etiquetas"
                            onClick={() => { if (!p.codigo) return toast("Ese producto no tiene código; edítalo y genera uno", "warn"); addToLabels(p.id); toast("Agregado a etiquetas"); }}>
                            <Icon name="tag" />
                          </button>
                          <button className="btn-icon sm" title="Editar" aria-label="Editar" onClick={() => setEdit(p)}><Icon name="edit" /></button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <div className="panel">
          <Empty icon="box" title={productos.length ? "Ningún producto coincide con el filtro" : "Aún no tienes productos"}>
            {!productos.length && canEdit && <span>Da clic en “Nuevo producto” o escanea un código para registrarlo.</span>}
          </Empty>
        </div>
      )}
      {edit && (
        <ProductoForm
          producto={edit === "new" ? null : edit}
          preset={edit === "new" ? preset : undefined}
          categorias={categorias}
          canDelete={isAdmin}
          onClose={() => setEdit(null)}
        />
      )}
    </div>
  );
}
