import { requirePage } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { money } from "@/lib/format";
import { PrintBar } from "../PrintBar";
import { Barcode } from "../Barcode";

export const metadata = { title: "Etiquetas" };

const SIZES = { "50x25": [50, 25], "40x30": [40, 30] } as const;

export default async function Labels({ searchParams }: { searchParams: Promise<{ f?: string; n?: string; p?: string; items?: string }> }) {
  const s = await requirePage(["ADMIN", "ALMACEN"]);
  const sp = await searchParams;
  const pairs = (sp.items ?? "").split(",").map((x) => x.split(":")).filter((x) => x[0]).slice(0, 300);
  const ps = await prisma.producto.findMany({ where: { tenantId: s.tid, id: { in: pairs.map((x) => x[0]) } } });
  const byId = new Map(ps.map((p) => [p.id, p]));
  const list = pairs.flatMap(([id, n]) => {
    const p = byId.get(id);
    return p?.codigo ? Array(Math.min(500, Math.max(1, Number(n) || 1))).fill(p) : [];
  }).slice(0, 1500) as typeof ps;
  const showN = sp.n !== "0", showP = sp.p !== "0";
  const carta = sp.f === "carta";
  const [w, h] = carta ? [66.7, 25.4] : SIZES[(sp.f as keyof typeof SIZES)] ?? SIZES["50x25"];

  const label = (p: (typeof ps)[number], i: number) => (
    <div key={i} className="lb" style={{ width: `${w}mm`, height: `${h}mm` }}>
      <div className="lt"><span>{showN ? p.nombre : ""}</span><b>{showP ? money(p.precio) : ""}</b></div>
      <Barcode value={p.codigo!} height={h > 27 ? 46 : 34} fontSize={10} width={1.4} />
    </div>
  );

  return (
    <>
      <style>{`
        .lb{box-sizing:border-box;padding:1.5mm 2mm;background:#fff;color:#000;overflow:hidden;display:flex;flex-direction:column;gap:.6mm;font-family:Arial,Helvetica,sans-serif}
        .lb .lt{display:flex;justify-content:space-between;gap:2mm;font-size:7.5pt;line-height:1.1}
        .lb .lt span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
        .lb .lt b{font-size:${h > 27 ? 11 : 9.5}pt;white-space:nowrap}
        .lb svg{width:100%;flex:1;min-height:0;margin:0}
        .roll{display:flex;flex-direction:column;align-items:center;gap:4mm;padding:16px}
        .sheet-c{display:grid;grid-template-columns:repeat(3,${w}mm);column-gap:3.1mm;row-gap:0;padding:12.7mm 4.8mm;width:215.9mm;background:#fff;margin:16px auto}
        @media screen{.roll .lb{box-shadow:var(--sh-2);border-radius:2px}}
        @media print{
          ${carta ? "@page{size:letter;margin:0}" : `@page{size:${w}mm ${h}mm;margin:0}`}
          .roll{padding:0;gap:0}
          .roll .lb{break-after:page}
          .sheet-c{margin:0}
          .sheet-c .lb:nth-child(30n){break-after:page}
        }
      `}</style>
      <PrintBar />
      {list.length ? (carta ? <div className="sheet-c">{list.map(label)}</div> : <div className="roll">{list.map(label)}</div>)
        : <p style={{ textAlign: "center", padding: 40 }}>No hay productos con código para imprimir.</p>}
    </>
  );
}
