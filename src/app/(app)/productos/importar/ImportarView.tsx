"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { importarProductos, type FilaImport, type ResultadoImport } from "@/app/actions/importar";
import { money, norm, parseNum, qty } from "@/lib/format";
import { Icon } from "@/components/Icon";
import { toast } from "@/components/ui";

type Campo = "nombre" | "codigo" | "sku" | "categoria" | "unidad" | "precio" | "costo" | "existencia" | "minimo" | "proveedor" | "ubicacion";
const CAMPOS: { k: Campo; l: string; req?: boolean; syn: string[] }[] = [
  { k: "nombre", l: "Nombre", req: true, syn: ["nombre", "producto", "descripcion", "articulo", "nombre del producto"] },
  { k: "codigo", l: "Código de barras", syn: ["codigo", "codigo de barras", "barras", "barcode", "ean", "upc", "cod barras"] },
  { k: "sku", l: "SKU / clave", syn: ["sku", "clave", "clave interna", "referencia", "modelo"] },
  { k: "categoria", l: "Categoría", syn: ["categoria", "departamento", "familia", "linea", "grupo"] },
  { k: "unidad", l: "Unidad", syn: ["unidad", "unidad de medida", "um", "medida"] },
  { k: "precio", l: "Precio de venta", req: true, syn: ["precio", "precio venta", "precio de venta", "precio publico", "pv", "venta"] },
  { k: "costo", l: "Costo", syn: ["costo", "precio compra", "precio de compra", "costo unitario", "pc", "compra"] },
  { k: "existencia", l: "Existencia", syn: ["existencia", "stock", "inventario", "cantidad", "existencias", "piezas"] },
  { k: "minimo", l: "Mínimo", syn: ["minimo", "stock minimo", "min", "inventario minimo"] },
  { k: "proveedor", l: "Proveedor", syn: ["proveedor", "marca"] },
  { k: "ubicacion", l: "Ubicación", syn: ["ubicacion", "pasillo", "anaquel", "lugar"] },
];
const BLOQUE = 200;

function parseCSV(text: string): string[][] {
  const first = text.split(/\r?\n/, 1)[0] ?? "";
  const sep = (first.match(/;/g)?.length ?? 0) > (first.match(/,/g)?.length ?? 0) ? ";" : first.includes("\t") ? "\t" : ",";
  const rows: string[][] = [];
  let row: string[] = [], cell = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; }
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === sep) { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cell); rows.push(row); row = []; cell = "";
    } else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((x) => x.trim()));
}

const clean = (h: unknown) => norm(String(h ?? "")).replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();

export function ImportarView({ existentes }: { existentes: { nombre: string; codigo: string | null; sku: string | null }[] }) {
  const router = useRouter();
  const [archivo, setArchivo] = useState<string | null>(null);
  const [tabla, setTabla] = useState<string[][]>([]);
  const [hdr, setHdr] = useState(0);
  const [map, setMap] = useState<Partial<Record<Campo, number>>>({});
  const [existentesOpt, setExOpt] = useState<"actualizar" | "omitir">("actualizar");
  const [stockOpt, setStockOpt] = useState<"reemplazar" | "sumar">("reemplazar");
  const [prog, setProg] = useState<number | null>(null);
  const [res, setRes] = useState<ResultadoImport | null>(null);
  const [drag, setDrag] = useState(false);

  const load = async (f: File) => {
    setRes(null);
    try {
      let rows: string[][];
      if (/\.(csv|txt)$/i.test(f.name)) rows = parseCSV(await f.text());
      else {
        const { readSheet } = await import("read-excel-file/browser");
        const data = await readSheet(f);
        rows = data.map((r) => r.map((c) => (c == null ? "" : c instanceof Date ? c.toISOString().slice(0, 10) : String(c))));
      }
      if (!rows.length) return toast("El archivo está vacío.", "warn");
      // Encabezado: la primera fila (de las 10 primeras) que reconozca más columnas.
      let best = 0, bestScore = -1;
      rows.slice(0, 10).forEach((r, i) => {
        const sc = r.filter((h) => CAMPOS.some((c) => c.syn.includes(clean(h)))).length;
        if (sc > bestScore) { best = i; bestScore = sc; }
      });
      const m: Partial<Record<Campo, number>> = {};
      rows[best].forEach((h, i) => {
        const c = CAMPOS.find((x) => x.syn.includes(clean(h)) && m[x.k] === undefined);
        if (c) m[c.k] = i;
      });
      setTabla(rows); setHdr(best); setMap(m); setArchivo(f.name);
    } catch {
      toast("No pude leer el archivo. Guárdalo como .xlsx o .csv e intenta de nuevo.", "bad");
    }
  };

  const idx = useMemo(() => ({
    cod: new Set(existentes.filter((p) => p.codigo).map((p) => p.codigo!.toLowerCase())),
    sku: new Set(existentes.filter((p) => p.sku).map((p) => p.sku!.toLowerCase())),
    nom: new Set(existentes.map((p) => norm(p.nombre))),
  }), [existentes]);

  const filas = useMemo(() => {
    const cell = (r: string[], k: Campo) => (map[k] === undefined ? "" : String(r[map[k]!] ?? "").trim());
    const num = (r: string[], k: Campo) => { const v = cell(r, k); return v === "" ? undefined : /\d/.test(v) ? parseNum(v) : NaN; };
    return tabla.slice(hdr + 1).map((r, i) => {
      const f: FilaImport = {
        fila: hdr + i + 2, nombre: cell(r, "nombre"), codigo: cell(r, "codigo") || undefined, sku: cell(r, "sku") || undefined,
        categoria: cell(r, "categoria") || undefined, unidad: cell(r, "unidad") || undefined, precio: num(r, "precio") ?? NaN,
        costo: num(r, "costo"), existencia: num(r, "existencia"), minimo: num(r, "minimo"),
        proveedor: cell(r, "proveedor") || undefined, ubicacion: cell(r, "ubicacion") || undefined,
      };
      const malNum = (["costo", "existencia", "minimo"] as const).find((k) => f[k] !== undefined && !Number.isFinite(f[k]!));
      const error = !f.nombre ? "Sin nombre" : !Number.isFinite(f.precio) || f.precio < 0 ? "Precio no válido" : malNum ? `${CAMPOS.find((c) => c.k === malNum)!.l} no válido` : "";
      const existe = !!((f.codigo && idx.cod.has(f.codigo.toLowerCase())) || (f.sku && idx.sku.has(f.sku.toLowerCase())) || idx.nom.has(norm(f.nombre)));
      return { f, error, existe };
    }).filter((x) => x.f.nombre || x.f.codigo || Number.isFinite(x.f.precio));
  }, [tabla, hdr, map, idx]);

  const validas = filas.filter((x) => !x.error);
  const nuevos = validas.filter((x) => !x.existe).length;
  const actualizar = validas.length - nuevos;
  const faltan = CAMPOS.filter((c) => c.req && map[c.k] === undefined);

  const importar = async () => {
    const lote = validas.map((x) => x.f);
    const total: ResultadoImport = { creados: 0, actualizados: 0, omitidos: 0, errores: [] };
    setProg(0);
    for (let i = 0; i < lote.length; i += BLOQUE) {
      const r = await importarProductos(lote.slice(i, i + BLOQUE), { existentes: existentesOpt, existencia: stockOpt }, i + BLOQUE >= lote.length);
      if (!r.ok) { toast(r.error, "bad"); setProg(null); return; }
      total.creados += r.data!.creados; total.actualizados += r.data!.actualizados; total.omitidos += r.data!.omitidos; total.errores.push(...r.data!.errores);
      setProg(Math.min(1, (i + BLOQUE) / lote.length));
    }
    total.errores.push(...filas.filter((x) => x.error).map((x) => ({ fila: x.f.fila, error: x.error })));
    setRes(total); setProg(null);
    router.refresh();
  };

  return (
    <div className="wrap">
      <div className="phead">
        <div><p className="eyebrow"><Link className="link" href="/productos">Productos</Link> · Importar</p><h1>Importar desde Excel</h1></div>
        <div className="acts"><a className="btn" href="/api/plantilla"><Icon name="download" />Descargar plantilla</a></div>
      </div>

      {res ? (
        <section className="panel">
          <div className="done-head" style={{ alignItems: "flex-start" }}>
            <h2>Importación terminada</h2>
            <p className="muted">{archivo}</p>
          </div>
          <div className="kpis">
            <div className="kpi"><span className="lbl">Nuevos</span><strong className="val">{res.creados}</strong><span className="sub">&nbsp;</span></div>
            <div className="kpi"><span className="lbl">Actualizados</span><strong className="val">{res.actualizados}</strong><span className="sub">&nbsp;</span></div>
            <div className="kpi"><span className="lbl">Omitidos</span><strong className="val">{res.omitidos}</strong><span className="sub">ya existían</span></div>
            <div className="kpi"><span className="lbl">Con error</span><strong className="val">{res.errores.length}</strong><span className="sub">&nbsp;</span></div>
          </div>
          {res.errores.length > 0 && (
            <div className="list">{res.errores.slice(0, 50).map((e, i) => <div key={i} className="li"><span className="pill bad nodot">Fila {e.fila}</span><div className="t"><small>{e.error}</small></div></div>)}</div>
          )}
          <div className="mfoot"><button className="btn" onClick={() => { setRes(null); setTabla([]); setArchivo(null); }}>Importar otro archivo</button><Link className="btn primary" href="/productos">Ver productos</Link></div>
        </section>
      ) : !archivo ? (
        <label className={`drop ${drag ? "on" : ""}`}
          onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
          onDrop={(e) => { e.preventDefault(); setDrag(false); const f = e.dataTransfer.files[0]; if (f) load(f); }}>
          <input type="file" accept=".xlsx,.csv,.txt" onChange={(e) => { const f = e.target.files?.[0]; if (f) load(f); }} />
          <span className="empty-ic"><Icon name="upload" /></span>
          <b>Arrastra tu archivo aquí o toca para elegirlo</b>
          <span className="muted">Excel (.xlsx) o CSV. La primera fila debe tener los nombres de las columnas: Nombre, Código, Precio, Costo, Existencia…</span>
        </label>
      ) : (
        <>
          <section className="panel">
            <div className="panel-h"><h3>Columnas de {archivo}</h3><button className="btn sm" onClick={() => { setArchivo(null); setTabla([]); }}>Cambiar archivo</button></div>
            <p className="muted" style={{ fontSize: ".88rem" }}>Revisa a qué columna de tu archivo corresponde cada dato. Detecté las que tienen nombre conocido.</p>
            <div className="form-grid">
              {CAMPOS.map((c) => (
                <label key={c.k} className="fld"><span>{c.l}{c.req ? " *" : ""}</span>
                  <select value={map[c.k] ?? ""} onChange={(e) => setMap((m) => ({ ...m, [c.k]: e.target.value === "" ? undefined : Number(e.target.value) }))}>
                    <option value="">— No importar —</option>
                    {(tabla[hdr] ?? []).map((h, i) => <option key={i} value={i}>{h || `Columna ${i + 1}`}</option>)}
                  </select>
                </label>
              ))}
            </div>
          </section>

          <div className="kpis">
            <div className="kpi"><span className="lbl">Filas listas</span><strong className="val">{validas.length}</strong><span className="sub">de {filas.length}</span></div>
            <div className="kpi"><span className="lbl">Productos nuevos</span><strong className="val">{nuevos}</strong><span className="sub">&nbsp;</span></div>
            <div className="kpi"><span className="lbl">Ya existen</span><strong className="val">{actualizar}</strong><span className="sub">por código, SKU o nombre</span></div>
            <div className="kpi"><span className="lbl">Con error</span><strong className="val">{filas.length - validas.length}</strong><span className="sub">se omiten</span></div>
          </div>

          <section className="panel">
            <h3>Vista previa</h3>
            <div className="tbl" style={{ maxHeight: 380, overflow: "auto" }}>
              <table>
                <thead><tr><th>Fila</th><th>Nombre</th><th>Código</th><th>Categoría</th><th className="num">Precio</th><th className="num">Costo</th><th className="num">Existencia</th><th>Estado</th></tr></thead>
                <tbody>
                  {filas.slice(0, 100).map((x) => (
                    <tr key={x.f.fila}>
                      <td className="mono muted">{x.f.fila}</td>
                      <td>{x.f.nombre || <span className="muted">—</span>}</td>
                      <td className="mono">{x.f.codigo ?? "—"}</td>
                      <td>{x.f.categoria ?? "—"}</td>
                      <td className="num">{Number.isFinite(x.f.precio) ? money(x.f.precio) : "—"}</td>
                      <td className="num">{x.f.costo !== undefined ? money(x.f.costo) : "—"}</td>
                      <td className="num">{x.f.existencia !== undefined ? qty(x.f.existencia) : "—"}</td>
                      <td>{x.error ? <span className="pill bad">{x.error}</span> : x.existe ? <span className="pill acc">Actualizar</span> : <span className="pill ok">Nuevo</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {filas.length > 100 && <p className="muted">Se muestran 100 de {filas.length} filas.</p>}
          </section>

          <section className="panel">
            <h3>Opciones</h3>
            <div className="fld"><span>Si el producto ya existe</span>
              <div className="seg">
                <button className={existentesOpt === "actualizar" ? "on" : ""} onClick={() => setExOpt("actualizar")}>Actualizar sus datos</button>
                <button className={existentesOpt === "omitir" ? "on" : ""} onClick={() => setExOpt("omitir")}>Dejarlo como está</button>
              </div>
            </div>
            {map.existencia !== undefined && existentesOpt === "actualizar" && (
              <div className="fld"><span>Existencia de productos que ya existen</span>
                <div className="seg">
                  <button className={stockOpt === "reemplazar" ? "on" : ""} onClick={() => setStockOpt("reemplazar")}>Reemplazar (es un conteo)</button>
                  <button className={stockOpt === "sumar" ? "on" : ""} onClick={() => setStockOpt("sumar")}>Sumar (es mercancía que llegó)</button>
                </div>
              </div>
            )}
            {faltan.length > 0 && <p className="err">Elige la columna de: {faltan.map((c) => c.l).join(", ")}.</p>}
            {prog !== null && <div className="onb-bar"><i style={{ width: `${Math.round(prog * 100)}%` }} /></div>}
            <div className="mfoot">
              <button className="btn primary" disabled={!validas.length || faltan.length > 0 || prog !== null} onClick={importar}>
                <Icon name="upload" />{prog !== null ? `Importando… ${Math.round(prog * 100)}%` : `Importar ${validas.length} productos`}
              </button>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
