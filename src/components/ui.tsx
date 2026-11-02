"use client";

import { useEffect } from "react";
import { Icon } from "./Icon";

/* ---------- Toasts ---------- */
type ToastKind = "" | "bad" | "warn";
export function toast(msg: string, kind: ToastKind = "") {
  window.dispatchEvent(new CustomEvent("ordz-toast", { detail: { msg, kind } }));
}
export function Toaster() {
  useEffect(() => {
    const box = document.getElementById("toasts");
    const on = (e: Event) => {
      const { msg, kind } = (e as CustomEvent).detail as { msg: string; kind: ToastKind };
      if (!box) return;
      const t = document.createElement("div");
      t.className = "toast " + kind;
      t.innerHTML =
        `<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="${kind ? "M12 3l10 18H2zM12 10v4M12 17h.01" : "M5 12l5 5L20 7"}"/></svg>`;
      const s = document.createElement("span");
      s.textContent = msg;
      t.appendChild(s);
      box.appendChild(t);
      setTimeout(() => t.remove(), 3800);
    };
    window.addEventListener("ordz-toast", on);
    return () => window.removeEventListener("ordz-toast", on);
  }, []);
  return <div id="toasts" aria-live="polite" />;
}

/* ---------- Modal ---------- */
export function Modal({
  open, onClose, children, size = "", label,
}: { open: boolean; onClose: () => void; children: React.ReactNode; size?: string; label?: string }) {
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div id="modal">
      <div className="scrim" onClick={onClose} />
      <div className={`sheet ${size}`} role="dialog" aria-modal="true" aria-label={label}>
        {children}
      </div>
    </div>
  );
}

export function ModalHead({ title, eyebrow, onClose }: { title: React.ReactNode; eyebrow?: string; onClose: () => void }) {
  return (
    <div className="mhead">
      <div>
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h2>{title}</h2>
      </div>
      <button type="button" className="btn-icon" onClick={onClose} aria-label="Cerrar"><Icon name="x" /></button>
    </div>
  );
}

export function Empty({ icon = "box", title, children }: { icon?: Parameters<typeof Icon>[0]["name"]; title: string; children?: React.ReactNode }) {
  return (
    <div className="empty">
      <Icon name={icon} />
      <b>{title}</b>
      {children}
    </div>
  );
}

