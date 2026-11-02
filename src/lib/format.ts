// Utilidades compartidas entre servidor y cliente.

export const r2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;
export const r3 = (n: number) => Math.round((Number(n) || 0) * 1000) / 1000;
/** Decimal de Prisma (o string/number) a number. */
export const n = (v: unknown) => (v == null ? 0 : Number(v));

const mx = new Intl.NumberFormat("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const money = (v: unknown) => "$" + mx.format(n(v));
export const qty = (v: unknown) => n(v).toLocaleString("es-MX", { maximumFractionDigits: 3 });
export const parseNum = (v: unknown) => {
  const x = parseFloat(String(v ?? "").replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(x) ? x : 0;
};

export const initials = (s: string) =>
  String(s || "?").trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
export const firstName = (s: string) => String(s || "").split(" ")[0];
export const norm = (s: string) =>
  String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

const HUES = [222, 200, 246, 188, 262, 212, 232, 276];
/** Tono estable por categoría, para colorear miniaturas. */
export function hue(cat?: string | null) {
  let h = 0;
  for (const ch of String(cat || "Sin categoría")) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return HUES[h % HUES.length];
}

export const ROLES = { ADMIN: "Administrador", CAJERO: "Cajero", ALMACEN: "Almacén" } as const;
export const METODOS = { EFECTIVO: "Efectivo", TARJETA: "Tarjeta", TRANSFERENCIA: "Transferencia" } as const;
export const MOV_TIPOS = {
  INICIAL: "Inicial",
  ENTRADA: "Entrada",
  SALIDA: "Salida",
  AJUSTE: "Ajuste",
  VENTA: "Venta",
  CANCELACION: "Cancelación",
} as const;
