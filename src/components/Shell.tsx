"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { logout } from "@/app/actions/auth";
import { buscarGlobal, type Hit } from "@/app/actions/buscar";
import { GROUPS, NAV, type RolKey } from "@/lib/nav";
import { firstName, hue, initials, money, norm, qty, ROLES } from "@/lib/format";
import { Icon, Mark, type IconName } from "./Icon";
import { Modal, Toaster } from "./ui";

type Props = {
  user: { nombre: string; rol: RolKey };
  negocio: string;
  caja: { nombre: string; abierta: boolean } | null;
  lowCount: number;
  aviso?: string | null;
  children: React.ReactNode;
};

export function Shell({ user, negocio, caja, lowCount, aviso, children }: Props) {
  const path = usePathname();
  const router = useRouter();
  const [palette, setPalette] = useState(false);
  const [more, setMore] = useState(false);
  const items = NAV.filter((n) => n.roles.includes(user.rol));
  const isOn = (href: string) => path === href || path.startsWith(href + "/");

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPalette(true);
      } else if (e.key === "F2" && user.rol !== "ALMACEN") {
        e.preventDefault();
        if (path !== "/venta") router.push("/venta");
        else (document.getElementById("posQ") as HTMLInputElement | null)?.focus();
      }
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [path, router, user.rol]);

  const tabs = (user.rol === "ALMACEN" ? ["/inicio", "/inventario", "/escanear", "/productos"] : ["/inicio", "/venta", "/escanear", "/productos"])
    .map((h) => NAV.find((n) => n.href === h)!);

  return (
    <div id="shell">
      <aside className="rail">
        <div className="brand">
          <Mark />
          <div><b>Ordanza</b><small>{negocio}</small></div>
        </div>
        <nav className="nav">
          {GROUPS.map((g) => {
            const its = g.hrefs.map((h) => items.find((n) => n.href === h)).filter(Boolean) as typeof items;
            if (!its.length) return null;
            return (
              <div key={g.label} style={{ display: "contents" }}>
                <p className="nav-g">{g.label}</p>
                {its.map((n) => (
                  <Link key={n.href} href={n.href} className={isOn(n.href) ? "on" : ""} title={n.label} prefetch>
                    <Icon name={n.icon} /><span>{n.label}</span>
                  </Link>
                ))}
              </div>
            );
          })}
        </nav>
        <div className="rail-user">
          <span className="av">{initials(user.nombre)}</span>
          <div><b>{user.nombre}</b><small>{ROLES[user.rol]}</small></div>
          <form action={logout}><button title="Cerrar sesión" aria-label="Cerrar sesión"><Icon name="logout" /></button></form>
        </div>
      </aside>

      <main>
        {aviso && <div className="lic-banner"><Icon name="alert" />{aviso}</div>}
        <header className="top">
          <div className="m-brand"><Mark /><b style={{ fontFamily: "var(--f-display)", color: "var(--ink)" }}>{negocio}</b></div>
          <button className="cmdk" type="button" onClick={() => setPalette(true)} aria-label="Buscar">
            <Icon name="search" /><span>Buscar producto, folio o acción</span><span className="kbd">Ctrl K</span>
          </button>
          <span className="grow" />
          <Link className="btn-icon bell" href="/productos?stock=bajo" aria-label="Productos bajo mínimo">
            <Icon name="bell" />{lowCount > 0 && <b>{lowCount > 99 ? "99+" : lowCount}</b>}
          </Link>
          {user.rol !== "ALMACEN" ? (
            <Link className="chip" href="/venta">
              <span className={`dot ${caja?.abierta ? "ok" : "bad"}`} />
              {caja?.nombre ?? "Sin caja"}<span className="cs"> · {caja?.abierta ? "abierta" : "cerrada"}</span>
            </Link>
          ) : (
            <span className="chip"><Icon name="user" />{firstName(user.nombre)}</span>
          )}
        </header>
        <section>{children}</section>
      </main>

      <nav className="tabbar">
        {tabs.map((n) =>
          n.href === "/escanear" ? (
            <Link key={n.href} href={n.href} className="fab" aria-label="Escanear"><span className="f"><Icon name="scan" /></span></Link>
          ) : (
            <Link key={n.href} href={n.href} className={isOn(n.href) ? "on" : ""}><Icon name={n.icon} /><span>{n.label}</span></Link>
          ),
        )}
        <a onClick={() => setMore(true)} role="button" tabIndex={0}><Icon name="grid" /><span>Más</span></a>
      </nav>

      <Modal open={more} onClose={() => setMore(false)} size="sm" label="Menú">
        <div className="mhead"><h2>Menú</h2><button className="btn-icon" onClick={() => setMore(false)} aria-label="Cerrar"><Icon name="x" /></button></div>
        <div className="more-list">
          {items.map((n) => (
            <Link key={n.href} href={n.href} onClick={() => setMore(false)}><Icon name={n.icon} />{n.label}</Link>
          ))}
        </div>
        <div className="row gap">
          <span className="av">{initials(user.nombre)}</span>
          <div className="grow"><b>{user.nombre}</b><div className="muted" style={{ fontSize: ".84rem" }}>{ROLES[user.rol]}</div></div>
          <form action={logout}><button className="btn"><Icon name="logout" />Salir</button></form>
        </div>
      </Modal>

      {palette && <Palette rol={user.rol} onClose={() => setPalette(false)} />}
      <Toaster />
    </div>
  );
}

type Item = { g: string; l: string; sub?: string; icon?: IconName; hue?: number; ini?: string; k?: string; go: () => void };

function Palette({ rol, onClose }: { rol: RolKey; onClose: () => void }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [sel, setSel] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const nav = useCallback((href: string) => { onClose(); router.push(href); }, [onClose, router]);

  useEffect(() => {
    if (!q.trim()) { setHits([]); return; }
    const t = setTimeout(() => buscarGlobal(q).then(setHits).catch(() => setHits([])), 160);
    return () => clearTimeout(t);
  }, [q]);

  const acts: Item[] = [
    ...(rol !== "ALMACEN" ? [{ g: "Acciones", l: "Nueva venta", icon: "cart" as IconName, k: "F2", go: () => nav("/venta") }] : []),
    ...(rol !== "CAJERO" ? [{ g: "Acciones", l: "Nuevo producto", icon: "plus" as IconName, go: () => nav("/productos?nuevo=1") }] : []),
    { g: "Acciones", l: "Escanear con la cámara", icon: "camera", go: () => nav("/escanear?camara=1") },
    { g: "Acciones", l: "Nueva cita", icon: "cal", go: () => nav("/agenda?nueva=1") },
    ...NAV.filter((n) => n.roles.includes(rol)).map((n) => ({ g: "Ir a", l: n.label, icon: n.icon, go: () => nav(n.href) })),
  ];
  const qn = norm(q.trim());
  const items: Item[] = [
    ...hits.map((h): Item =>
      h.kind === "producto"
        ? { g: "Productos", l: h.nombre, sub: `${money(h.precio)} · ${h.esServicio ? "servicio" : qty(h.stock) + " " + h.unidad + " en existencia"}`, hue: hue(h.categoria), ini: initials(h.nombre), go: () => nav(`/escanear?id=${h.id}`) }
        : { g: "Ventas", l: h.folio, sub: money(h.total), icon: "cart", go: () => nav(`/ventas/${h.id}`) },
    ),
    ...(qn ? acts.filter((a) => norm(a.l).includes(qn)) : acts),
  ];
  const cur = Math.min(sel, Math.max(0, items.length - 1));

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      setSel(Math.max(0, Math.min(items.length - 1, cur + (e.key === "ArrowDown" ? 1 : -1))));
      setTimeout(() => listRef.current?.querySelector(".on")?.scrollIntoView({ block: "nearest" }));
    } else if (e.key === "Enter") {
      e.preventDefault();
      items[cur]?.go();
    }
  };

  let lastG = "";
  return (
    <Modal open onClose={onClose} size="cmdk-sheet" label="Buscar">
      <div className="cmdk-in">
        <Icon name="search" />
        <input autoFocus value={q} onChange={(e) => { setQ(e.target.value); setSel(0); }} onKeyDown={onKey} placeholder="Busca productos, folios o acciones" />
        <span className="kbd">Esc</span>
      </div>
      <div className="cmdk-list" ref={listRef}>
        {items.length ? items.map((x, i) => {
          const head = x.g !== lastG ? <p className="ck-g">{x.g}</p> : null;
          lastG = x.g;
          return (
            <div key={i}>
              {head}
              <button className={`ck-i ${i === cur ? "on" : ""}`} onClick={x.go} onMouseMove={() => setSel(i)}>
                {x.ini ? <span className="thumb sm cat" style={{ ["--h" as string]: x.hue }}>{x.ini}</span> : <span className="ck-ic"><Icon name={x.icon ?? "box"} /></span>}
                <span className="t"><b>{x.l}</b>{x.sub && <small>{x.sub}</small>}</span>
                {x.k && <span className="kbd">{x.k}</span>}
              </button>
            </div>
          );
        }) : <div className="empty"><Icon name="search" />Sin resultados</div>}
      </div>
    </Modal>
  );
}
