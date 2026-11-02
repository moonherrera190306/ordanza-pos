import { requirePage } from "@/lib/auth";
import { productosDTO } from "@/lib/stock";
import { EtiquetasView } from "./EtiquetasView";

export const metadata = { title: "Etiquetas" };

export default async function Page() {
  const s = await requirePage(["ADMIN", "ALMACEN"]);
  const productos = await productosDTO(s.tid, { soloActivos: true });
  return <EtiquetasView productos={productos} />;
}
