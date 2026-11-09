import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { registroAbierto } from "@/lib/registro";
import { MODO_LOCAL } from "@/lib/modo";
import { RegistroForm } from "./RegistroForm";

export const metadata = { title: "Crear cuenta" };
// Depende de la base y del modo en tiempo de ejecución; no se prerenderiza.
export const dynamic = "force-dynamic";

export default async function Page() {
  if (!(await registroAbierto())) notFound();
  if (await getSession()) redirect("/inicio");
  return <RegistroForm local={MODO_LOCAL} />;
}
