// Gráficas SVG sin dependencias; se pueden renderizar en el servidor.
import { money } from "@/lib/format";

function niceMax(v: number) {
  if (v <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  const x = v / p;
  return (x <= 1 ? 1 : x <= 2 ? 2 : x <= 5 ? 5 : 10) * p;
}
const short = (v: number) => (v >= 1000 ? "$" + (v / 1000).toLocaleString("es-MX", { maximumFractionDigits: 1 }) + "k" : "$" + Math.round(v));

export function BarChart({ data, fmt = money }: { data: { l: string; v: number }[]; fmt?: (v: number) => string }) {
  const W = 640, H = 230, L = 58, B = 26, T = 10, R = 8;
  const max = niceMax(Math.max(0, ...data.map((d) => d.v)));
  const iw = W - L - R, ih = H - T - B, bw = iw / Math.max(1, data.length);
  const hi = data.reduce((m, d, i) => (d.v > data[m].v ? i : m), 0);
  const step = Math.ceil(data.length / 12);
  return (
    <div className="chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Gráfica de barras">
        <g className="grid">
          {[0, 0.5, 1].map((f) => {
            const y = T + ih - f * ih;
            return (
              <g key={f}>
                <line x1={L} x2={W - R} y1={y} y2={y} />
                <text x={L - 6} y={y + 3} textAnchor="end">{short(f * max)}</text>
              </g>
            );
          })}
        </g>
        {data.map((d, i) => {
          const h = (d.v / max) * ih;
          const x = L + i * bw + bw * 0.18;
          return (
            <g key={i}>
              <rect className={`b ${i === hi && d.v > 0 ? "hi" : ""}`} x={x} y={T + ih - h} width={bw * 0.64} height={Math.max(h, d.v > 0 ? 2 : 0)} rx={3}>
                <title>{`${d.l}: ${fmt(d.v)}`}</title>
              </rect>
              {i % step === 0 && <text x={x + bw * 0.32} y={H - 8} textAnchor="middle">{d.l}</text>}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export function HBars({ rows, fmt = money }: { rows: { l: string; v: number; s?: string }[]; fmt?: (v: number) => string }) {
  if (!rows.length) return <div className="empty">Sin datos en este periodo</div>;
  const max = Math.max(...rows.map((r) => r.v)) || 1;
  return (
    <div className="list">
      {rows.map((r) => (
        <div key={r.l} className="hbar" style={{ padding: "6px 0" }}>
          <span>{r.l}</span>
          <b className="mono">{fmt(r.v)}{r.s ? <small className="muted"> {r.s}</small> : null}</b>
          <div className="track"><i style={{ width: `${((r.v / max) * 100).toFixed(1)}%` }} /></div>
        </div>
      ))}
    </div>
  );
}
