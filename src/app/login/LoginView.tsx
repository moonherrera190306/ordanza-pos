"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { loginEmail, loginPin } from "@/app/actions/auth";
import { Icon, Mark } from "@/components/Icon";
import { initials, ROLES } from "@/lib/format";

type Device = { negocio: string; caja: string; usuarios: { id: string; nombre: string; rol: string }[] } | null;

function Clock() {
  const [t, setT] = useState("");
  useEffect(() => {
    const f = () => setT(new Date().toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" }));
    f();
    const i = setInterval(f, 15000);
    return () => clearInterval(i);
  }, []);
  return <div className="clock">{t || "--:--"}</div>;
}

export function Brand({ negocio }: { negocio: string }) {
  return (
    <div className="login-brand">
      <div className="row gap" style={{ color: "var(--rail-hi)" }}>
        <Mark />
        <span className="eyebrow" style={{ color: "var(--rail-ink)" }}>Ordanza · Inventario y punto de venta</span>
      </div>
      <div>
        <h1>{negocio}</h1>
        <p style={{ marginTop: 14, maxWidth: "36ch" }}>Ventas, existencias, etiquetas y reportes en un solo lugar.</p>
        <div className="login-feats">
          <span>Varias cajas</span><span>Lector y cámara</span><span>Corte de caja</span><span>Reportes</span>
        </div>
      </div>
      <div>
        <Clock />
        <div style={{ textTransform: "capitalize" }}>
          {new Date().toLocaleDateString("es-MX", { weekday: "long", day: "numeric", month: "long" })}
        </div>
      </div>
    </div>
  );
}

export function LoginView({ device, registroAbierto }: { device: Device; registroAbierto: boolean }) {
  const [mode, setMode] = useState<"pin" | "email">(device ? "pin" : "email");
  return (
    <div className="login">
      <Brand negocio={device?.negocio ?? "Ordanza POS"} />
      <div className="login-panel">
        {device && (
          <div className="seg" style={{ alignSelf: "flex-start" }}>
            <button className={mode === "pin" ? "on" : ""} onClick={() => setMode("pin")}>Con PIN</button>
            <button className={mode === "email" ? "on" : ""} onClick={() => setMode("email")}>Con correo</button>
          </div>
        )}
        {mode === "pin" && device ? <PinLogin device={device} /> : <EmailLogin />}
        {!device && (
          <p className="muted" style={{ fontSize: ".86rem" }}>
            Para que tu equipo entre con PIN, un administrador debe vincularlo a una caja en Ajustes → Cajas.
          </p>
        )}
        {registroAbierto && (
          <p className="muted" style={{ fontSize: ".9rem" }}>
            ¿Negocio nuevo? <Link className="link" href="/registro">Crea tu cuenta</Link>
          </p>
        )}
      </div>
    </div>
  );
}

function EmailLogin() {
  const [state, action, pending] = useActionState(loginEmail, undefined);
  return (
    <form action={action} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div>
        <p className="eyebrow">Iniciar sesión</p>
        <h2 style={{ fontSize: "1.6rem", marginTop: 4 }}>Bienvenido</h2>
      </div>
      <label className="fld"><span>Correo</span><input name="email" type="email" autoComplete="username" required autoFocus /></label>
      <label className="fld"><span>Contraseña</span><input name="password" type="password" autoComplete="current-password" required /></label>
      {state?.error && <p className="err" role="alert">{state.error}</p>}
      <button className="btn primary xl" disabled={pending}>{pending ? "Entrando…" : "Entrar"}</button>
    </form>
  );
}

function PinLogin({ device }: { device: NonNullable<Device> }) {
  const [state, action, pending] = useActionState(loginPin, undefined);
  const [uid, setUid] = useState<string | null>(null);
  const [pin, setPin] = useState("");
  const formRef = useRef<HTMLFormElement>(null);
  const sel = device.usuarios.find((u) => u.id === uid);

  useEffect(() => {
    if (state?.error) setPin("");
  }, [state]);

  useEffect(() => {
    if (!uid) return;
    const onKey = (e: KeyboardEvent) => {
      if (/^\d$/.test(e.key)) setPin((p) => (p.length < 6 ? p + e.key : p));
      else if (e.key === "Backspace") setPin((p) => p.slice(0, -1));
      else if (e.key === "Enter") formRef.current?.requestSubmit();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [uid]);

  if (!sel)
    return (
      <>
        <div>
          <p className="eyebrow">{device.caja}</p>
          <h2 style={{ fontSize: "1.6rem", marginTop: 4 }}>¿Quién va a trabajar?</h2>
        </div>
        <div className="users">
          {device.usuarios.map((u) => (
            <button key={u.id} className="ucard" onClick={() => { setUid(u.id); setPin(""); }}>
              <span className="av">{initials(u.nombre)}</span>
              <span><b>{u.nombre}</b><small>{ROLES[u.rol as keyof typeof ROLES]}</small></span>
            </button>
          ))}
        </div>
      </>
    );

  const press = (k: string) => {
    if (k === "del") setPin((p) => p.slice(0, -1));
    else if (k === "go") formRef.current?.requestSubmit();
    else setPin((p) => (p.length < 6 ? p + k : p));
  };

  return (
    <form ref={formRef} action={action} style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <input type="hidden" name="uid" value={sel.id} />
      <input type="hidden" name="pin" value={pin} />
      <div className="row gap">
        <button type="button" className="btn-icon" onClick={() => setUid(null)} aria-label="Cambiar usuario"><Icon name="undo" /></button>
        <span className="av">{initials(sel.nombre)}</span>
        <div><b>{sel.nombre}</b><div className="muted" style={{ fontSize: ".85rem" }}>{ROLES[sel.rol as keyof typeof ROLES]} · {device.caja}</div></div>
      </div>
      <div className="fld">
        <span style={{ textAlign: "center" }}>Escribe tu PIN</span>
        <div className={`pin-dots ${state?.error ? "shake" : ""}`} key={state?.error ? Math.random() : "d"}>
          {[0, 1, 2, 3, 4, 5].map((i) => <i key={i} className={i < pin.length ? "f" : ""} />)}
        </div>
        {state?.error && <p className="err" style={{ textAlign: "center" }} role="alert">{state.error}</p>}
      </div>
      <div className="pad">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((k) => <button type="button" key={k} onClick={() => press(k)}>{k}</button>)}
        <button type="button" onClick={() => press("del")} aria-label="Borrar"><Icon name="undo" /></button>
        <button type="button" onClick={() => press("0")}>0</button>
        <button type="button" className="go" disabled={pending || pin.length < 4} onClick={() => press("go")}>{pending ? "…" : "Entrar"}</button>
      </div>
    </form>
  );
}
