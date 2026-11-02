import { requirePage } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { ImportarView } from "./ImportarView";

export const metadata = { title: "Importar productos" };

export default async function Importar() {
  const s = await requirePage(["ADMIN", "ALMACEN"]);
  const ps = await prisma.producto.findMany({ where: { tenantId: s.tid }, select: { nombre: true, codigo: true, sku: true } });
  return <ImportarView existentes={ps} />;
}
