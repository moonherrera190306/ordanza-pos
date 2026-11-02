import { requirePage } from "@/lib/auth";
import { EscanearView } from "./EscanearView";

export const metadata = { title: "Escanear" };

export default async function Page({ searchParams }: { searchParams: Promise<{ id?: string; camara?: string }> }) {
  const s = await requirePage();
  const sp = await searchParams;
  return <EscanearView rol={s.user.rol} tz={s.tenant.zonaHoraria} initialId={sp.id ?? null} camara={sp.camara === "1"} />;
}
