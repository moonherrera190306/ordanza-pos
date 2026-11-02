import { AuthError } from "./auth";

export type ActionResult<T = unknown> = { ok: true; data?: T; msg?: string } | { ok: false; error: string };

export class UserError extends Error {}

/** Envuelve una server action: errores esperados regresan como mensaje, no como excepción. */
export async function run<T>(fn: () => Promise<T>, msg?: string): Promise<ActionResult<T>> {
  try {
    const data = await fn();
    return { ok: true, data, msg };
  } catch (e) {
    if (e instanceof UserError || e instanceof AuthError) return { ok: false, error: e.message };
    const code = (e as { code?: string })?.code;
    if (code === "P2002") return { ok: false, error: "Ya existe un registro con ese dato (código o clave repetida)." };
    console.error(e);
    return { ok: false, error: "Algo salió mal al guardar. Intenta de nuevo." };
  }
}
