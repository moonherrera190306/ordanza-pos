import { addDays } from "./dates";

export const PRESETS = [
  ["hoy", "Hoy"],
  ["ayer", "Ayer"],
  ["7d", "7 días"],
  ["30d", "30 días"],
  ["mes", "Este mes"],
] as const;

const ymdRe = /^\d{4}-\d{2}-\d{2}$/;

/** Resuelve el periodo de un reporte a partir de los parámetros de la URL. */
export function periodo(hoy: string, sp: { p?: string; desde?: string; hasta?: string }) {
  if (ymdRe.test(sp.desde ?? "") && ymdRe.test(sp.hasta ?? "")) {
    const [a, b] = [sp.desde!, sp.hasta!].sort();
    return { preset: "", desde: a, hasta: b };
  }
  const p = sp.p ?? "7d";
  switch (p) {
    case "hoy": return { preset: p, desde: hoy, hasta: hoy };
    case "ayer": return { preset: p, desde: addDays(hoy, -1), hasta: addDays(hoy, -1) };
    case "30d": return { preset: p, desde: addDays(hoy, -29), hasta: hoy };
    case "mes": return { preset: p, desde: hoy.slice(0, 8) + "01", hasta: hoy };
    default: return { preset: "7d", desde: addDays(hoy, -6), hasta: hoy };
  }
}

export function csv(rows: unknown[][]) {
  return "﻿" + rows.map((r) => r.map((v) => {
    const s = v == null ? "" : String(v);
    return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }).join(",")).join("\n");
}
