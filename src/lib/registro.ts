import { prisma } from "./db";
import { MODO_LOCAL } from "./modo";

/** En la nube depende de REGISTRO_ABIERTO; en modo local solo mientras no exista el negocio (primer arranque). */
export async function registroAbierto() {
  if (process.env.REGISTRO_ABIERTO === "true") return true;
  return MODO_LOCAL && (await prisma.tenant.count()) === 0;
}
