// Fechas en la zona horaria del negocio. Las ventas se guardan en UTC;
// los reportes y "hoy" se calculan en la zona del tenant.

export function ymdIn(tz: string, d: Date = new Date()) {
  const p = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
  return p; // YYYY-MM-DD
}

function offsetMinutes(tz: string, d: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(d);
  const g = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const asUTC = Date.UTC(g("year"), g("month") - 1, g("day"), g("hour"), g("minute"), g("second"));
  return (asUTC - d.getTime()) / 60000;
}

/** Inicio (inclusive) del día YYYY-MM-DD en la zona tz, como Date UTC. */
export function startOfDay(tz: string, ymd: string) {
  const [y, m, d] = ymd.split("-").map(Number);
  const guess = new Date(Date.UTC(y, m - 1, d, 12));
  const off = offsetMinutes(tz, guess);
  return new Date(Date.UTC(y, m - 1, d) - off * 60000);
}

export function addDays(ymd: string, days: number) {
  const [y, m, d] = ymd.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return t.toISOString().slice(0, 10);
}

/** Rango [desde, hasta) en UTC para un intervalo de días locales inclusivo. */
export function rangeOf(tz: string, from: string, to: string) {
  return { gte: startOfDay(tz, from), lt: startOfDay(tz, addDays(to, 1)) };
}

export function fmtDT(d: Date | string, tz: string) {
  return new Date(d).toLocaleString("es-MX", { timeZone: tz, day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}
export function fmtLong(ymd: string) {
  return new Date(ymd + "T12:00:00Z").toLocaleDateString("es-MX", { timeZone: "UTC", weekday: "long", day: "numeric", month: "long" });
}
