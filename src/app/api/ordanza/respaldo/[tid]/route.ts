import { esSuperAdmin, getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { respaldoResponse, respaldoTenant } from "@/lib/respaldo";

export async function GET(_: Request, { params }: { params: Promise<{ tid: string }> }) {
  const s = await getSession();
  if (!s || !esSuperAdmin(s)) return new Response("Sin permiso", { status: 403 });
  const { tid } = await params;
  const t = await prisma.tenant.findUnique({ where: { id: tid } });
  if (!t) return new Response("No existe", { status: 404 });
  return respaldoResponse(await respaldoTenant(t.id), t.slug);
}
