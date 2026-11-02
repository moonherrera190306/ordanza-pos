"use client";

import { useEffect } from "react";

export function PrintBar({ auto }: { auto?: boolean }) {
  useEffect(() => {
    if (auto) {
      const t = setTimeout(() => window.print(), 350);
      return () => clearTimeout(t);
    }
  }, [auto]);
  return (
    <div className="printbar">
      <button className="btn primary" onClick={() => window.print()}>Imprimir</button>
      <button className="btn" onClick={() => (window.opener ? window.close() : history.back())}>Cerrar</button>
    </div>
  );
}
