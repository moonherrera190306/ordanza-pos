import { requirePage } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { productosDTO } from "@/lib/stock";
import { ProductosView } from "./ProductosView";

export const metadata = { title: "Productos" };

export default async function ProductosPage({ searchParams }: { searchParams: Promise<{ stock?: string; nuevo?: string; codigo?: string }> }) {
  const s = await requirePage();
  const sp = await searchParams;
  const [productos, cats] = await Promise.all([
    productosDTO(s.tid),
    prisma.categoria.findMany({ where: { tenantId: s.tid }, orderBy: { nombre: "asc" }, select: { nombre: true } }),
  ]);
  return (
    <ProductosView
      productos={productos}
      categorias={cats.map((c) => c.nombre)}
      rol={s.user.rol}
      initialStock={sp.stock ?? ""}
      openNew={sp.nuevo === "1" ? { codigo: sp.codigo ?? "" } : null}
    />
  );
}
