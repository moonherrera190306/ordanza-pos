import { getSession } from "@/lib/auth";
import { csv } from "@/lib/periodo";

/** Plantilla para importar productos. */
export async function GET() {
  if (!(await getSession())) return new Response("Sesión expirada", { status: 401 });
  const rows = [
    ["Nombre", "Código de barras", "SKU", "Categoría", "Unidad", "Precio", "Costo", "Existencia", "Mínimo", "Proveedor", "Ubicación"],
    ["Cuaderno profesional raya 100 h", "7501031311309", "PAP-001", "Papelería", "pza", 45, 28, 36, 10, "Distribuidora Escolar", "Pasillo 1"],
    ["Frijol bayo", "", "ABA-002", "Abarrotes", "kg", 38, 27, 25.5, 10, "Abarrotera Zamora", "Bodega"],
  ];
  return new Response(csv(rows), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="plantilla-productos.csv"' } });
}
