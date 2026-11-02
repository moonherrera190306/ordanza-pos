import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { RegistroForm } from "./RegistroForm";

export const metadata = { title: "Crear cuenta" };

export default async function Page() {
  if (process.env.REGISTRO_ABIERTO !== "true") notFound();
  if (await getSession()) redirect("/inicio");
  return <RegistroForm />;
}
