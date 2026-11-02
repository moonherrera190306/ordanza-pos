import { hue, initials } from "@/lib/format";

export function Thumb({ nombre, categoria, fotoUrl, size = "" }: { nombre: string; categoria?: string | null; fotoUrl?: string | null; size?: string }) {
  return (
    <span className={`thumb ${size} cat`} style={{ ["--h" as string]: hue(categoria) }}>
      {fotoUrl ? <img src={fotoUrl} alt="" /> : initials(nombre)}
    </span>
  );
}

export function StockPill({ p }: { p: { esServicio: boolean; stock: number; minimo: number } }) {
  if (p.esServicio) return <span className="pill acc">Servicio</span>;
  if (p.stock <= 0) return <span className="pill bad">Agotado</span>;
  if (p.stock <= p.minimo) return <span className="pill warn">{p.stock.toLocaleString("es-MX", { maximumFractionDigits: 3 })} · bajo</span>;
  return <span className="pill ok">{p.stock.toLocaleString("es-MX", { maximumFractionDigits: 3 })}</span>;
}
