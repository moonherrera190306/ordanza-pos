"use client";

import { useActionState } from "react";
import { registrar } from "@/app/actions/auth";
import { Brand } from "@/app/login/LoginView";

export function RegistroForm() {
  const [state, action, pending] = useActionState(registrar, undefined);
  return (
    <div className="login">
      <Brand negocio="Ordanza POS" />
      <form action={action} className="login-panel">
        <div>
          <p className="eyebrow">Primera vez</p>
          <h2 style={{ fontSize: "1.6rem", marginTop: 4 }}>Crea tu negocio</h2>
          <p className="muted" style={{ marginTop: 6 }}>Serás el administrador: das de alta cajas, usuarios y productos.</p>
        </div>
        <label className="fld"><span>Nombre del negocio</span><input name="negocio" required autoFocus placeholder="Ferretería López" /></label>
        <label className="fld"><span>Tu nombre</span><input name="nombre" required /></label>
        <label className="fld"><span>Correo</span><input name="email" type="email" autoComplete="username" required /></label>
        <div className="grid2">
          <label className="fld"><span>Contraseña</span><input name="password" type="password" autoComplete="new-password" minLength={8} required /></label>
          <label className="fld"><span>PIN de caja (4–6 dígitos)</span><input name="pin" className="mono" inputMode="numeric" pattern="\d{4,6}" maxLength={6} required /></label>
        </div>
        {state?.error && <p className="err" role="alert">{state.error}</p>}
        <button className="btn primary xl" disabled={pending}>{pending ? "Creando…" : "Crear y entrar"}</button>
      </form>
    </div>
  );
}
