"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { guardarProveedor, registrarCompra } from "@/app/actions/compras";
import { fmtDT } from "@/lib/dates";
import { money, parseNum, qty, r2 } from "@/lib/format";
import type { ProductoDTO } from "@/lib/stock";
import { Icon } from "@/components/Icon";
import { ProductPicker } from "@/components/ProductPicker";
import { Empty, Modal, ModalHead, toast } from "@/components/ui";

type Prov = { id: string; nombre: string; contacto: string; telefono: string; email: string; rfc: string; nota: string; activo: boolean; compras: number };
type CompraRow = { id: string; proveedor: string | null; factura: string | null; total: number; usuario: string; creado: string; pagadoDeCaja: boolean; nota: string | null; items: { nombre: string; cantidad: number; costo: number; importe: number }[] };

export function ComprasView({ tab, tz, cajaAbierta, productos, proveedores, compras }: {
  tab: "compras" | "proveedores"; tz: string; cajaAbierta: boolean; productos: ProductoDTO[]; proveedores: Prov[]; compras: CompraRow[];
}) {
  const [nueva, setNueva] = useState(false);
  const [prov, setProv] = useState<Prov | "new" | null>(null);
  const [ver, setVer] = useState<CompraRow | null>(null);
  const mes = new Date().toISOString().slice(0, 7);
  const delMes = compras.filter((c) => c.creado.slice(0, 7) === mes);

  return (
    <div className="wrap">
      <div className="phead">
        <div><p className="eyebrow">Entrada de mercancía</p><h1>Compras</h1></div>
        <div className="acts">
          {tab === "proveedores"
            ? <button className="btn primary" onClick={() => setProv("new")}><Icon name="plus" />Nuevo proveedor</button>
            : <button className="btn primary" onClick={() => setNueva(true)}><Icon name="truck" />Registrar compra</button>}
        </div>
      </div>
      <div className="seg">
        <Link href="/compras" className={tab === "compras" ? "on" : ""}>Compras</Link>
        <Link href="/compras?tab=proveedores" className={tab === "proveedores" ? "on" : ""}>Proveedores ({proveedores.length})</Link>
      </div>

      {tab === "compras" ? (
        <>
          <div className="kpis">
            <div className="kpi"><span className="lbl">Comprado este mes</span><strong className="val">{money(delMes.reduce((a, c) => a + c.total, 0))}</strong><span className="sub">{delMes.length} compras</span></div>
            <div className="kpi"><span className="lbl">Pagado de caja</span><strong className="val">{money(delMes.filter((c) => c.pagadoDeCaja).reduce((a, c) => a + c.total, 0))}</strong><span className="sub">este mes</span></div>
            <div className="kpi"><span className="lbl">Proveedores</span><strong className="val">{proveedores.filter((p) => p.activo).length}</strong><span className="sub">activos</span></div>
            <div className="kpi"><span className="lbl">Última compra</span><strong className="val" style={{ fontSize: "1.1rem" }}>{compras[0] ? fmtDT(compras[0].creado, tz) : "—"}</strong><span className="sub">{compras[0]?.proveedor ?? " "}</span></div>
          </div>
          {compras.length ? (
            <div className="tbl cards">
              <table>
                <thead><tr><th>Fecha</th><th>Proveedor</th><th>Factura</th><th className="num">Productos</th><th className="num">Total</th><th>Registró</th></tr></thead>
                <tbody>
                  {compras.map((c) => (
                    <tr key={c.id} onClick={() => setVer(c)} style={{ cursor: "pointer" }}>
                      <td className="first"><b>{fmtDT(c.creado, tz)}</b></td>
                      <td data-l="Proveedor">{c.proveedor ?? "—"}</td>
                      <td data-l="Factura" className="mono">{c.factura ?? "—"}</td>
                      <td data-l="Productos" className="num">{c.items.length}</td>
                      <td data-l="Total" className="num">{money(c.total)}{c.pagadoDeCaja && <span className="pill acc nodot" style={{ marginLeft: 6 }}>caja</span>}</td>
                      <td data-l="Registró">{c.usuario}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <div className="panel"><Empty icon="truck" title="Aún no hay compras"><span>Registra la mercancía que llega para sumar existencia y actualizar costos.</span></Empty></div>}
        </>
      ) : (
        proveedores.length ? (
          <div className="tbl cards">
            <table>
              <thead><tr><th>Proveedor</th><th>Contacto</th><th>Teléfono</th><th className="num">Compras</th><th></th></tr></thead>
              <tbody>
                {proveedores.map((p) => (
                  <tr key={p.id}>
                    <td className="first"><b>{p.nombre}</b>{!p.activo && <span className="pill nodot" style={{ marginLeft: 6 }}>inactivo</span>}<div className="muted" style={{ fontSize: ".78rem" }}>{p.rfc}</div></td>
                    <td data-l="Contacto">{p.contacto || "—"}</td>
                    <td data-l="Teléfono">{p.telefono || "—"}</td>
                    <td data-l="Compras" className="num">{p.compras}</td>
                    <td><div className="row-acts"><button className="btn-icon sm" onClick={() => setProv(p)} aria-label={`Editar ${p.nombre}`}><Icon name="edit" /></button></div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <div className="panel"><Empty icon="users" title="Aún no hay proveedores" /></div>
      )}

      {nueva && <NuevaCompra productos={productos} proveedores={proveedores.filter((p) => p.activo)} cajaAbierta={cajaAbierta} onClose={() => setNueva(false)} />}
      {prov && <ProvForm prov={prov === "new" ? null : prov} onClose={() => setProv(null)} />}
      {ver && (
        <Modal open onClose={() => setVer(null)} size="lg" label="Compra">
          <ModalHead title={ver.proveedor ?? "Compra sin proveedor"} eyebrow={`${fmtDT(ver.creado, tz)} · ${ver.usuario}${ver.factura ? " · factura " + ver.factura : ""}`} onClose={() => setVer(null)} />
          <div className="tbl"><table>
            <thead><tr><th>Producto</th><th className="num">Cantidad</th><th className="num">Costo</th><th className="num">Importe</th></tr></thead>
            <tbody>{ver.items.map((i, k) => <tr key={k}><td>{i.nombre}</td><td className="num">{qty(i.cantidad)}</td><td className="num">{money(i.costo)}</td><td className="num">{money(i.importe)}</td></tr>)}</tbody>
          </table></div>
          <div className="change"><span>Total{ver.pagadoDeCaja ? " · pagado con efectivo de caja" : ""}</span><b className="mono">{money(ver.total)}</b></div>
          {ver.nota && <p className="muted">{ver.nota}</p>}
        </Modal>
      )}
    </div>
  );
}

type Linea = { p: ProductoDTO; cant: string; costo: string };

function NuevaCompra({ productos, proveedores, cajaAbierta, onClose }: { productos: ProductoDTO[]; proveedores: Prov[]; cajaAbierta: boolean; onClose: () => void }) {
  const router = useRouter();
  const [lineas, setLineas] = useState<Linea[]>([]);
  const [provId, setProvId] = useState("");
  const [factura, setFactura] = useState("");
  const [nota, setNota] = useState("");
  const [costo, setCosto] = useState(true);
  const [caja, setCaja] = useState(false);
  const [pending, start] = useTransition();
  const total = r2(lineas.reduce((a, l) => a + parseNum(l.cant) * parseNum(l.costo), 0));
  const add = (p: ProductoDTO) => setLineas((ls) => {
    const i = ls.findIndex((l) => l.p.id === p.id);
    if (i >= 0) return ls.map((l, k) => (k === i ? { ...l, cant: String(parseNum(l.cant) + 1) } : l));
    return [...ls, { p, cant: "1", costo: String(p.costo || "") }];
  });
  const upd = (i: number, k: "cant" | "costo", v: string) => setLineas((ls) => ls.map((l, j) => (j === i ? { ...l, [k]: v } : l)));
  return (
    <Modal open onClose={onClose} size="lg" label="Registrar compra">
      <ModalHead title="Registrar compra" eyebrow="Escanea o busca cada producto que llegó" onClose={onClose} />
      <div className="grid2">
        <label className="fld"><span>Proveedor</span>
          <select value={provId} onChange={(e) => setProvId(e.target.value)}>
            <option value="">Sin proveedor</option>
            {proveedores.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
          </select>
        </label>
        <label className="fld"><span>Factura o remisión</span><input className="mono" value={factura} onChange={(e) => setFactura(e.target.value)} placeholder="Opcional" /></label>
      </div>
      <ProductPicker productos={productos} onPick={add} placeholder="Escanea o busca el producto que llegó" />
      {lineas.length ? (
        <div className="tbl"><table>
          <thead><tr><th>Producto</th><th className="num">Existencia</th><th className="num">Cantidad</th><th className="num">Costo unitario</th><th className="num">Importe</th><th></th></tr></thead>
          <tbody>
            {lineas.map((l, i) => (
              <tr key={l.p.id}>
                <td><b>{l.p.nombre}</b><div className="muted mono" style={{ fontSize: ".76rem" }}>costo actual {money(l.p.costo)}</div></td>
                <td className="num">{qty(l.p.stock)}</td>
                <td className="num"><input className="mono" inputMode="decimal" style={{ width: 80, textAlign: "right" }} value={l.cant} onChange={(e) => upd(i, "cant", e.target.value)} aria-label="Cantidad" /></td>
                <td className="num"><input className="mono" inputMode="decimal" style={{ width: 100, textAlign: "right" }} value={l.costo} onChange={(e) => upd(i, "costo", e.target.value)} aria-label="Costo unitario" /></td>
                <td className="num">{money(parseNum(l.cant) * parseNum(l.costo))}</td>
                <td><button className="x" onClick={() => setLineas((ls) => ls.filter((_, j) => j !== i))} aria-label="Quitar"><Icon name="trash" /></button></td>
              </tr>
            ))}
          </tbody>
        </table></div>
      ) : <Empty icon="scan" title="Agrega los productos que llegaron" />}
      <label className="fld"><span>Nota</span><input value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Opcional" /></label>
      <label className="chk"><input type="checkbox" checked={costo} onChange={(e) => setCosto(e.target.checked)} /> Actualizar el costo de los productos (promedio con lo que ya hay)</label>
      {cajaAbierta && <label className="chk"><input type="checkbox" checked={caja} onChange={(e) => setCaja(e.target.checked)} /> Se pagó con efectivo de la caja (sale en el corte)</label>}
      <div className="change"><span>Total de la compra</span><b className="mono">{money(total)}</b></div>
      <div className="mfoot">
        <button className="btn" onClick={onClose}>Cancelar</button>
        <button className="btn primary" disabled={pending || !lineas.length} onClick={() => start(async () => {
          const r = await registrarCompra({
            proveedorId: provId || undefined, factura, nota, actualizarCosto: costo, pagarDeCaja: caja,
            items: lineas.map((l) => ({ productoId: l.p.id, cant: parseNum(l.cant), costo: parseNum(l.costo) })).filter((x) => x.cant > 0),
          });
          if (!r.ok) return toast(r.error, "bad");
          toast(r.msg!); onClose(); router.refresh();
        })}><Icon name="check" />{pending ? "Guardando…" : "Registrar compra"}</button>
      </div>
    </Modal>
  );
}

function ProvForm({ prov, onClose }: { prov: Prov | null; onClose: () => void }) {
  const router = useRouter();
  const [f, setF] = useState({ nombre: prov?.nombre ?? "", contacto: prov?.contacto ?? "", telefono: prov?.telefono ?? "", email: prov?.email ?? "", rfc: prov?.rfc ?? "", nota: prov?.nota ?? "", activo: prov?.activo ?? true });
  const [pending, start] = useTransition();
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF((x) => ({ ...x, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value }));
  return (
    <Modal open onClose={onClose} label="Proveedor">
      <form style={{ display: "flex", flexDirection: "column", gap: 14 }} onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await guardarProveedor({ id: prov?.id, ...f });
          if (!r.ok) return toast(r.error, "bad");
          toast(r.msg!); onClose(); router.refresh();
        });
      }}>
        <ModalHead title={prov ? "Editar proveedor" : "Nuevo proveedor"} onClose={onClose} />
        <label className="fld"><span>Nombre</span><input value={f.nombre} onChange={set("nombre")} autoFocus /></label>
        <div className="grid2">
          <label className="fld"><span>Contacto</span><input value={f.contacto} onChange={set("contacto")} /></label>
          <label className="fld"><span>Teléfono</span><input inputMode="tel" value={f.telefono} onChange={set("telefono")} /></label>
        </div>
        <div className="grid2">
          <label className="fld"><span>Correo</span><input type="email" value={f.email} onChange={set("email")} /></label>
          <label className="fld"><span>RFC</span><input className="mono" maxLength={13} value={f.rfc} onChange={set("rfc")} /></label>
        </div>
        <label className="fld"><span>Notas</span><input value={f.nota} onChange={set("nota")} placeholder="Días de visita, condiciones de pago…" /></label>
        {prov && <label className="chk"><input type="checkbox" checked={f.activo} onChange={set("activo")} /> Proveedor activo</label>}
        <div className="mfoot"><button type="button" className="btn" onClick={onClose}>Cancelar</button><button className="btn primary" disabled={pending}>Guardar</button></div>
      </form>
    </Modal>
  );
}
