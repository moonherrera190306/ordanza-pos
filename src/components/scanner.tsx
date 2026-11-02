"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "./Icon";
import { Modal, ModalHead } from "./ui";

/**
 * Lector de código de barras USB/Bluetooth (modo teclado).
 * Detecta ráfagas de teclas rápidas terminadas en Enter cuando el foco NO está en un campo.
 */
export function useScanner(onCode: (code: string) => void, enabled = true) {
  const cb = useRef(onCode);
  cb.current = onCode;
  useEffect(() => {
    if (!enabled) return;
    let buf = "";
    let last = 0;
    const k = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t?.closest?.("input,textarea,select,[contenteditable]")) return;
      if (document.querySelector("#modal")) return;
      const now = Date.now();
      if (now - last > 80) buf = "";
      last = now;
      if (e.key === "Enter") {
        if (buf.length >= 3) {
          e.preventDefault();
          cb.current(buf);
        }
        buf = "";
      } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) buf += e.key;
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [enabled]);
}

export function beep(ok = true) {
  try {
    const w = window as unknown as { __actx?: AudioContext; webkitAudioContext?: typeof AudioContext };
    w.__actx = w.__actx || new (window.AudioContext || w.webkitAudioContext!)();
    const ctx = w.__actx;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.value = ok ? 1400 : 280;
    g.gain.value = 0.05;
    o.connect(g).connect(ctx.destination);
    o.start();
    o.stop(ctx.currentTime + (ok ? 0.06 : 0.2));
  } catch {}
}

/** Escáner con la cámara en vivo (celular, tablet o webcam). */
export function CameraScanner({ open, onClose, onCode, title = "Escanear código" }: {
  open: boolean; onClose: () => void; onCode: (code: string) => void; title?: string;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const [err, setErr] = useState<string | null>(null);
  const cb = useRef(onCode);
  cb.current = onCode;

  useEffect(() => {
    if (!open) return;
    let stop: (() => void) | null = null;
    let done = false;
    setErr(null);
    (async () => {
      try {
        const { BrowserMultiFormatReader } = await import("@zxing/browser");
        const reader = new BrowserMultiFormatReader();
        const controls = await reader.decodeFromConstraints(
          { video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 } }, audio: false },
          video.current!,
          (res) => {
            if (res && !done) {
              done = true;
              beep(true);
              controls.stop();
              cb.current(res.getText());
            }
          },
        );
        stop = () => controls.stop();
        if (done) controls.stop();
      } catch (e) {
        const name = (e as { name?: string })?.name;
        setErr(
          name === "NotAllowedError"
            ? "Diste permiso denegado a la cámara. Actívalo en la configuración del navegador para este sitio."
            : name === "NotFoundError"
              ? "No encontré una cámara en este equipo."
              : "No se pudo iniciar la cámara. Usa HTTPS o revisa que otra app no la esté usando.",
        );
      }
    })();
    return () => { done = true; stop?.(); };
  }, [open]);

  return (
    <Modal open={open} onClose={onClose} size="sm" label={title}>
      <ModalHead title={title} onClose={onClose} />
      {err ? (
        <div className="empty"><Icon name="camera" /><b>{err}</b></div>
      ) : (
        <div style={{ position: "relative", borderRadius: 16, overflow: "hidden", background: "#000", aspectRatio: "4/3" }}>
          <video ref={video} playsInline muted style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          <div style={{ position: "absolute", inset: "30% 10%", border: "2px solid rgba(255,255,255,.9)", borderRadius: 12, boxShadow: "0 0 0 999px rgba(0,0,0,.35)" }} />
        </div>
      )}
      <p className="muted" style={{ fontSize: ".86rem", textAlign: "center" }}>Centra el código dentro del recuadro. Se lee solo.</p>
    </Modal>
  );
}
