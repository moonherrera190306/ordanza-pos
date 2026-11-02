"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { cobrar, cerrarTurno, resumenTurno, type ResumenTurno, type VentaHecha } from "@/app/actions/venta";
import { Icon } from "@/components/Icon";
import { Modal, ModalHead, toast } from "@/components/ui";
import { CameraScanner, beep, useScanner } from "@/components/scanner";
import { firstName, hue, initials, METODOS, money, norm, parseNum, qty, r2, r3 } from "@/lib/format";
import type { ProductoDTO } from "@/lib/stock";

type Line = { id: string; nombre: string; precio: number; unidad: string; cant: number; categoria: string | null };
type Desc = { type: "%" | "$"; value: number };
type Metodo = keyof typeof METODOS;

const CART_KEY = "ordz_cart";
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));

export function Pos({ productos, caja, cajero, ivaPct, sinStock }: {
  productos: ProductoDTO[]; caja: string; cajero: string; ivaPct: number; sinStock: boolean;
}) {
  const router = useRouter();
  const [cart, setCart] = useState<Line[]>([]);
  const [desc, setDesc] = useState<Desc>({ type: "%", value: 0 });
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("Todas");
  const [open, setOpen] = useState(false); // ticket en celular
  const [modal, setModal] = useState<null | "pay" | "disc" | "clear" | "corte" | "cam">(null);
  const [done, setDone] = useState<VentaHecha | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const qRef = useRef<HTMLInputElement>(null);

  // Ticket persistente por si se recarga la página.
  useEffect(() => {
    try {
      const s = JSON.parse(localStorage.getItem(CART_KEY) || "null");
      if (s?.cart) { setCart(s.cart); setDesc(s.desc ?? { type: "%", value: 0 }); }
    } catch {}
  }, []);
  useEffect(() => {
    try { localStorage.setItem(CART_KEY, JSON.stringify({ cart, desc })); } catch {}
  }, [cart, desc]);

  const byId = useMemo(() => new Map(productos.map((p) => [p.id, p])), [productos]);
  const byCode = useCallback((c: string) => {
    const l = c.trim().toLowerCase();
    return productos.find((p) => p.codigo?.toLowerCase() === l || p.sku?.toLowerCase() === l);
  }, [productos]);

  const totals = useMemo(() => {
    const sub = r2(cart.reduce((a, l) => a + l.precio * l.cant, 0));
    const d = r2(desc.type === "%" ? (sub * Math.min(100, Math.max(0, desc.value))) / 100 : Math.min(sub, Math.max(0, desc.value)));
    const total = r2(sub - d);
    return { sub, desc: d, total, iva: r2(total - total / (1 + ivaPct / 100)), n: r3(cart.reduce((a, l) => a + l.cant, 0)) };
  }, [cart, desc, ivaPct]);

  const cartRef = useRef(cart);
  cartRef.current = cart;
  const add = useCallback((p: ProductoDTO, n = 1) => {
    const c = cartRef.current;
    const l = c.find((x) => x.id === p.id);
    const want = r3((l?.cant ?? 0) + n);
    if (!sinStock && !p.esServicio && want > p.stock) {
      beep(false);
      toast(`Sin existencia suficiente de ${p.nombre} (hay ${qty(p.stock)})`, "warn");
      return;
    }
    beep(true);
    setFlash(p.id);
    setTimeout(() => setFlash(null), 450);
    const next = l ? c.map((x) => (x.id === p.id ? { ...x, cant: want } : x)) : [...c, { id: p.id, nombre: p.nombre, precio: p.precio, unidad: p.unidad, cant: n, categoria: p.categoria }];
    cartRef.current = next;
    setCart(next);
  }, [sinStock]);

  const setCant = (id: string, v: number) => {
    const p = byId.get(id);
    setCart((c) => {
      if (v <= 0) return c.filter((x) => x.id !== id);
      if (p && !sinStock && !p.esServicio && v > p.stock) {
        toast(`Solo hay ${qty(p.stock)}`, "warn");
        v = Math.max(0, p.stock);
      }
      return c.map((x) => (x.id === id ? { ...x, cant: r3(v) } : x));
    });
  };

  const scan = useCallback((code: string) => {
    const p = byCode(code);
    if (p) add(p);
    else { beep(false); toast(`Código ${code} no registrado`, "warn"); }
  }, [add, byCode]);
  useScanner(scan, !modal && !done);

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key === "F9" && !modal && !done) { e.preventDefault(); if (cart.length) setModal("pay"); }
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [cart.length, modal, done]);

  useEffect(() => {
    if (matchMedia("(pointer:fine)").matches && !modal && !done) qRef.current?.focus();
  }, [modal, done]);

  const cats = useMemo(() => ["Todas", ...[...new Set(productos.map((p) => p.categoria || "Sin categoría"))].sort()], [productos]);
  const list = useMemo(() => {
    const qq = norm(q.trim());
    let l = qq ? productos.filter((p) => norm(`${p.nombre} ${p.codigo ?? ""} ${p.sku ?? ""} ${p.categoria ?? ""}`).includes(qq)) : productos;
    if (cat !== "Todas") l = l.filter((p) => (p.categoria || "Sin categoría") === cat);
    return l.slice(0, 160);
  }, [productos, q, cat]);

  const onSearchKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    const v = q.trim();
    if (!v) { if (cart.length) setModal("pay"); return; }
    const p = byCode(v);
    if (p) { add(p); setQ(""); return; }
    if (list.length === 1) { add(list[0]); setQ(""); return; }
    if (!list.length) { beep(false); toast(`Código ${v} no registrado`, "warn"); }
  };

  const finish = (v: VentaHecha) => {
    setCart([]);
    setDesc({ type: "%", value: 0 });
    setModal(null);
    setOpen(false);
    setDone(v);
    router.refresh();
  };

  return (
    <div className={`pos ${open ? "cart-open" : ""}`}>
      <section className="pos-main">
        <div className="pos-search">
          <Icon name="search" />
          <input id="posQ" ref={qRef} value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={onSearchKey}
            placeholder="Escanea o busca por nombre, código o SKU" autoComplete="off" enterKeyHint="search" />
          <button className="btn-icon" onClick={() => setModal("cam")} title="Escanear con cámara" aria-label="Escanear con cámara"><Icon name="camera" /></button>
        </div>
        <div className="chips">
          {cats.map((c) => (
            <button key={c} className={c === cat ? "on" : ""} onClick={() => setCat(c)}>
              {c !== "Todas" && <i className="cdot" style={{ ["--h" as string]: hue(c) }} />}{c}
            </button>
          ))}
        </div>
        <div className="tiles">
          {list.length ? list.map((p) => {
            const out = !p.esServicio && p.stock <= 0;
            const low = !p.esServicio && p.stock <= p.minimo;
            return (
              <button key={p.id} className={`tile ${out ? "out" : ""} ${flash === p.id ? "flash" : ""}`} onClick={() => add(p)}>
                <span className="tile-img cat" style={{ ["--h" as string]: hue(p.categoria) }}>
                  {p.fotoUrl ? <img src={p.fotoUrl} alt="" /> : initials(p.nombre)}
                </span>
                <span className="tile-name">{p.nombre}</span>
                <span className={`tile-stk ${out ? "bad" : low ? "warn" : ""}`}>
                  {p.esServicio ? "Servicio" : out ? "Agotado" : `${qty(p.stock)} ${p.unidad}${low ? " · bajo" : ""}`}
                </span>
                <span className="tile-foot"><b>{money(p.precio)}</b><span className="tile-add"><Icon name="plus" /></span></span>
              </button>
            );
          }) : (
            <div className="empty" style={{ gridColumn: "1/-1" }}>
              <Icon name="box" />
              <b>{productos.length ? "Ningún producto coincide" : "Aún no hay productos"}</b>
              {!productos.length && <span>Agrégalos en Productos.</span>}
            </div>
          )}
        </div>
      </section>

      <aside className="receipt">
        <div className="receipt-body">
          <div className="rc-head">
            <div><b>Venta actual</b><small>{caja} · {firstName(cajero)}</small></div>
            <div className="row" style={{ gap: 6 }}>
              <button className="btn sm ghost" onClick={() => setModal("corte")}><Icon name="cash" />Corte</button>
              {cart.length > 0 && <button className="btn-icon sm" onClick={() => setModal("clear")} title="Vaciar ticket" aria-label="Vaciar ticket"><Icon name="trash" /></button>}
              <button className="btn-icon sm rc-x" onClick={() => setOpen(false)} aria-label="Cerrar ticket"><Icon name="x" /></button>
            </div>
          </div>
          <div className="lines">
            {cart.length ? cart.map((l) => (
              <div className="ln" key={l.id}>
                <span className="ln-av cat" style={{ ["--h" as string]: hue(l.categoria) }}>{initials(l.nombre)}</span>
                <div className="ln-name">{l.nombre}<small>{money(l.precio)} / {l.unidad}</small></div>
                <span className="ln-amt">{money(l.precio * l.cant)}</span>
                <div className="ln-ctl">
                  <div className="qty">
                    <button onClick={() => setCant(l.id, r3(l.cant - 1))} aria-label="Menos"><Icon name="minus" /></button>
                    <QtyInput value={l.cant} onCommit={(v) => setCant(l.id, v)} />
                    <button onClick={() => { const p = byId.get(l.id); if (p) add(p); }} aria-label="Más"><Icon name="plus" /></button>
                  </div>
                  <button className="x" onClick={() => setCant(l.id, 0)} aria-label="Quitar"><Icon name="trash" /></button>
                </div>
              </div>
            )) : (
              <div className="rc-empty">
                <span className="empty-ic"><Icon name="scan" /></span>
                <b>El ticket está vacío</b>
                <span>Escanea un código o toca un producto para agregarlo</span>
                <span className="rc-keys"><span className="kbd">F2</span> buscar · <span className="kbd">F9</span> cobrar</span>
              </div>
            )}
          </div>
          <div className="tot">
            <div><span>Subtotal · {qty(totals.n)} art.</span><span>{money(totals.sub)}</span></div>
            {totals.desc > 0 && <div className="disc"><span>Descuento{desc.type === "%" ? ` ${desc.value}%` : ""}</span><span>−{money(totals.desc)}</span></div>}
            <div className="dim"><span>IVA incluido</span><span>{money(totals.iva)}</span></div>
            <div className="big"><span>Total</span><span>{money(totals.total)}</span></div>
            <div className="rc-acts">
              <button className="btn tot-btn" onClick={() => setModal("disc")} title="Descuento" aria-label="Descuento"><Icon name="percent" /></button>
              <button className="btn primary xl" disabled={!cart.length} onClick={() => setModal("pay")}>Cobrar {money(totals.total)}</button>
            </div>
          </div>
        </div>
      </aside>

      <button className="cartbar" onClick={() => setOpen(true)}>
        <span className="cb-n">{qty(totals.n)}</span>
        <span>{cart.length ? "Ver ticket" : "Ticket vacío"}</span>
        <span className="mono grow" style={{ textAlign: "right" }}>{money(totals.total)}</span>
      </button>

      <CameraScanner open={modal === "cam"} onClose={() => setModal(null)} onCode={(c) => { setModal(null); scan(c); }} />
      {modal === "pay" && <PayModal totals={totals} cart={cart} desc={desc} onClose={() => setModal(null)} onDone={finish} />}
      {modal === "disc" && <DiscModal desc={desc} onClose={() => setModal(null)} onApply={(d) => { setDesc(d); setModal(null); }} />}
      {modal === "corte" && <CorteModal onClose={() => setModal(null)} />}
      <Modal open={modal === "clear"} onClose={() => setModal(null)} size="sm" label="Vaciar ticket">
        <ModalHead title="¿Vaciar el ticket?" onClose={() => setModal(null)} />
        <p className="muted">Se quitarán todos los productos del ticket actual.</p>
        <div className="mfoot">
          <button className="btn" onClick={() => setModal(null)}>Cancelar</button>
          <button className="btn danger" onClick={() => { setCart([]); setDesc({ type: "%", value: 0 }); setModal(null); }}>Vaciar</button>
        </div>
      </Modal>
      {done && <DoneModal v={done} onClose={() => setDone(null)} />}
    </div>
  );
}

function QtyInput({ value, onCommit }: { value: number; onCommit: (v: number) => void }) {
  const [v, setV] = useState(String(value));
  useEffect(() => setV(String(value)), [value]);
  return (
    <input value={v} inputMode="decimal" aria-label="Cantidad"
      onChange={(e) => setV(e.target.value)}
      onBlur={() => onCommit(parseNum(v))}
      onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} />
  );
}

function PayModal({ totals, cart, desc, onClose, onDone }: {
  totals: { total: number; n: number }; cart: Line[]; desc: Desc; onClose: () => void; onDone: (v: VentaHecha) => void;
}) {
  const [metodo, setMetodo] = useState<Metodo>("EFECTIVO");
  const [rec, setRec] = useState("");
  const [cliente, setCliente] = useState("");
  const [pending, start] = useTransition();
  const clientId = useRef(uid());
  const t = totals.total;
  const val = rec === "" ? t : parseNum(rec);
  const ch = r2(val - t);
  const short = metodo === "EFECTIVO" && ch < 0;
  const bills = [...new Set([Math.ceil(t / 10) * 10, Math.ceil(t / 50) * 50, 100, 200, 500, 1000])].filter((b) => b > t).slice(0, 3);

  const key = (k: string) => setRec((r) => {
    if (k === "del") return r.slice(0, -1);
    if (k === ".") return r.includes(".") ? r : (r || "0") + ".";
    if (r.includes(".") && r.split(".")[1].length >= 2) return r;
    if (r.replace(/\..*/, "").length >= 7) return r;
    return r === "0" ? k : r + k;
  });

  const confirm = () => {
    if (short || pending) return;
    start(async () => {
      const res = await cobrar({
        clientId: clientId.current,
        items: cart.map((l) => ({ id: l.id, cant: l.cant })),
        desc, metodo, recibido: metodo === "EFECTIVO" ? r2(val) : t, cliente,
      });
      if (!res.ok) return toast(res.error, "bad");
      onDone(res.data!);
    });
  };

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.id === "payCli") { if (e.key === "Enter") { e.preventDefault(); confirm(); } return; }
      if (/^[0-9.]$/.test(e.key)) { e.preventDefault(); key(e.key); }
      else if (e.key === "Backspace") { e.preventDefault(); key("del"); }
      else if (e.key === "Enter") { e.preventDefault(); confirm(); }
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  });

  return (
    <Modal open onClose={onClose} size="pay" label="Cobrar">
      <div className="mhead">
        <div><p className="eyebrow">Cobrar {qty(totals.n)} artículos</p><div className="pay-total mono">{money(t)}</div></div>
        <button className="btn-icon" onClick={onClose} aria-label="Cerrar"><Icon name="x" /></button>
      </div>
      <div className="pay-m">
        {([["EFECTIVO", "cash"], ["TARJETA", "card"], ["TRANSFERENCIA", "swap"]] as const).map(([m, i]) => (
          <button key={m} className={m === metodo ? "on" : ""} onClick={() => setMetodo(m)}><Icon name={i} /><span>{METODOS[m]}</span></button>
        ))}
      </div>
      {metodo === "EFECTIVO" && (
        <div className="cash">
          <div className="cash-in">
            <span className="eyebrow">Recibido</span><b className="mono">{rec === "" ? money(t) : "$" + rec}</b>
            <span className="eyebrow">Cambio</span><b className={`mono chg ${ch < 0 ? "neg" : ""}`}>{ch < 0 ? "Faltan " + money(-ch) : money(ch)}</b>
          </div>
          <div className="quick">
            <button onClick={() => setRec(String(t))}>Exacto</button>
            {bills.map((b) => <button key={b} onClick={() => setRec(String(b))}>{money(b).replace(".00", "")}</button>)}
          </div>
          <div className="keypad">
            {["1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0", "del"].map((k) => (
              <button key={k} onClick={() => key(k)} aria-label={k === "del" ? "Borrar" : k}>{k === "del" ? <Icon name="undo" /> : k}</button>
            ))}
          </div>
        </div>
      )}
      <label className="fld"><span>Cliente (opcional)</span><input id="payCli" value={cliente} onChange={(e) => setCliente(e.target.value)} placeholder="Público en general" /></label>
      <button className="btn primary xl" disabled={short || pending} onClick={confirm}><Icon name="check" />{pending ? "Registrando…" : "Confirmar cobro"}</button>
    </Modal>
  );
}

function DiscModal({ desc, onClose, onApply }: { desc: Desc; onClose: () => void; onApply: (d: Desc) => void }) {
  const [type, setType] = useState(desc.type);
  const [v, setV] = useState(desc.value ? String(desc.value) : "");
  return (
    <Modal open onClose={onClose} size="sm" label="Descuento">
      <ModalHead title="Descuento al ticket" onClose={onClose} />
      <div className="seg">
        <button className={type === "%" ? "on" : ""} onClick={() => setType("%")}>Porcentaje</button>
        <button className={type === "$" ? "on" : ""} onClick={() => setType("$")}>Monto fijo</button>
      </div>
      <label className="fld"><span>Valor</span><input className="mono" inputMode="decimal" value={v} onChange={(e) => setV(e.target.value)} autoFocus /></label>
      <div className="mfoot">
        <button className="btn" onClick={() => onApply({ type: "%", value: 0 })}>Quitar descuento</button>
        <button className="btn primary" onClick={() => { const x = Math.max(0, parseNum(v)); onApply({ type, value: type === "%" ? Math.min(100, x) : x }); }}>Aplicar</button>
      </div>
    </Modal>
  );
}

function DoneModal({ v, onClose }: { v: VentaHecha; onClose: () => void }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === "Enter") { e.preventDefault(); onClose(); } };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  return (
    <Modal open onClose={onClose} size="sm done" label="Venta registrada">
      <div className="done-head">
        <span className="done-ic"><Icon name="check" /></span>
        <h2>Venta registrada</h2>
        <p className="muted mono" style={{ fontSize: ".84rem" }}>{v.folio} · {METODOS[v.metodo as Metodo]} · {money(v.total)}</p>
      </div>
      {v.metodo === "EFECTIVO" && (
        <div className="done-change"><span>Cambio a entregar</span><b className="mono">{money(v.cambio)}</b></div>
      )}
      <div className="done-acts">
        <button className="btn" onClick={() => window.open(`/imprimir/ticket/${v.id}?auto=1`, "_blank", "width=420,height=640")}><Icon name="printer" />Imprimir ticket</button>
        <button className="btn primary" onClick={onClose} autoFocus>Nueva venta</button>
      </div>
    </Modal>
  );
}

function CorteModal({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [r, setR] = useState<ResumenTurno | null>(null);
  const [contado, setContado] = useState("");
  const [nota, setNota] = useState("");
  const [closed, setClosed] = useState<{ id: string; dif: number } | null>(null);
  const [pending, start] = useTransition();

  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    resumenTurno().then((x) => (x.ok ? setR(x.data!) : (toast(x.error, "bad"), closeRef.current())));
  }, []);

  const dif = r && contado !== "" ? r2(parseNum(contado) - r.esperado) : null;

  if (closed)
    return (
      <Modal open onClose={() => { onClose(); router.refresh(); }} size="sm" label="Caja cerrada">
        <ModalHead title="Caja cerrada" onClose={() => { onClose(); router.refresh(); }} />
        <div className="change"><span>Diferencia</span><b className="mono">{money(closed.dif)}</b></div>
        <div className="mfoot">
          <button className="btn" onClick={() => window.open(`/imprimir/corte/${closed.id}?auto=1`, "_blank", "width=420,height=640")}><Icon name="printer" />Imprimir corte</button>
          <button className="btn primary" onClick={() => { onClose(); router.refresh(); }}>Listo</button>
        </div>
      </Modal>
    );

  return (
    <Modal open onClose={onClose} size="sm" label="Corte de caja">
      <ModalHead title={r ? `Corte · ${r.caja}` : "Corte de caja"} onClose={onClose} />
      {!r ? <p className="muted">Calculando…</p> : (
        <>
          <p className="muted">Abierta por {r.abiertoPor} · {new Date(r.abiertoEn).toLocaleString("es-MX", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</p>
          <div className="tot" style={{ borderRadius: 14 }}>
            <div><span>Tickets</span><span>{r.tickets}{r.cancelados ? ` (+${r.cancelados} cancelados)` : ""}</span></div>
            {(Object.keys(METODOS) as Metodo[]).map((m) => <div key={m}><span>{METODOS[m]}</span><span>{money(r.porMetodo[m])}</span></div>)}
            <div><span>Fondo inicial</span><span>{money(r.fondo)}</span></div>
            <div className="big"><span>Efectivo esperado</span><span>{money(r.esperado)}</span></div>
          </div>
          <label className="fld"><span>Efectivo contado</span>
            <input className="mono" inputMode="decimal" value={contado} onChange={(e) => setContado(e.target.value)} autoFocus style={{ height: 52, fontSize: "1.3rem" }} />
          </label>
          <div className="change"><span>Diferencia</span>
            <b className="mono" style={{ color: dif == null ? undefined : dif < 0 ? "var(--bad)" : dif > 0 ? "var(--warn)" : "var(--ok)" }}>
              {dif == null ? "—" : (dif > 0 ? "+" : "") + money(dif)}
            </b>
          </div>
          <label className="fld"><span>Notas</span><input value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Retiros, faltantes, observaciones" /></label>
          <div className="mfoot">
            <button className="btn" onClick={onClose}>Cancelar</button>
            <button className="btn primary" disabled={contado === "" || pending}
              onClick={() => start(async () => {
                const x = await cerrarTurno(parseNum(contado), nota);
                if (!x.ok) return toast(x.error, "bad");
                setClosed({ id: x.data!, dif: dif ?? 0 });
              })}>
              {pending ? "Cerrando…" : "Cerrar caja"}
            </button>
          </div>
        </>
      )}
    </Modal>
  );
}
