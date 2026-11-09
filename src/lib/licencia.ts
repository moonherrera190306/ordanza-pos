import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import { MODO_LOCAL } from "./modo";

/** Llave pública de Ordanza. La privada solo la tiene Ordanza (variable LICENCIA_PRIVADA). */
const PUBLICA = "MCowBQYDK2VwAyEAKDyaBOOsqqoy7Z/eJ8NpmKFDW+Ipk1o5iaQ7e8/0r4M=";
export const DIAS_PRUEBA = 15;

export type DatosLicencia = { v: 1; id: string; n: string; e: string; c: number; f: string };

let codigo: string | null = null;
/** Identificador estable de esta computadora, en formato XXXX-XXXX-XXXX-XXXX. */
export function codigoEquipo() {
  if (codigo) return codigo;
  let raw = "";
  try {
    if (process.platform === "win32") {
      const out = execFileSync("reg", ["query", "HKLM\\SOFTWARE\\Microsoft\\Cryptography", "/v", "MachineGuid"], { encoding: "utf8", windowsHide: true });
      raw = out.match(/MachineGuid\s+REG_SZ\s+(\S+)/i)?.[1] ?? "";
    } else raw = fs.readFileSync("/etc/machine-id", "utf8").trim();
  } catch {}
  if (!raw) raw = `${os.hostname()}|${os.userInfo().username}`;
  const h = crypto.createHash("sha256").update("ordanza:" + raw).digest("hex").slice(0, 16).toUpperCase();
  codigo = h.match(/.{4}/g)!.join("-");
  return codigo;
}

const b64u = (b: Buffer) => b.toString("base64url");

export function verificarLicencia(clave: string): { ok: true; datos: DatosLicencia } | { ok: false; error: string } {
  const partes = clave.trim().replace(/\s+/g, "").split(".");
  if (partes.length !== 3 || partes[0] !== "ORDZ1") return { ok: false, error: "La clave no tiene el formato correcto. Cópiala completa." };
  const payload = Buffer.from(partes[1], "base64url");
  const firma = Buffer.from(partes[2], "base64url");
  const pub = crypto.createPublicKey({ key: Buffer.from(PUBLICA, "base64"), format: "der", type: "spki" });
  if (!crypto.verify(null, payload, pub, firma)) return { ok: false, error: "La clave no es válida." };
  let datos: DatosLicencia;
  try { datos = JSON.parse(payload.toString("utf8")); } catch { return { ok: false, error: "La clave no es válida." }; }
  if (datos.e !== codigoEquipo()) return { ok: false, error: "Esta clave es para otra computadora. Pide una para el código de este equipo." };
  return { ok: true, datos };
}

/** Solo Ordanza: firma una licencia con la llave privada. */
export function firmarLicencia(d: Omit<DatosLicencia, "v" | "id" | "f">) {
  const priv = process.env.LICENCIA_PRIVADA;
  if (!priv) throw new Error("Falta LICENCIA_PRIVADA en el .env de Ordanza.");
  const key = crypto.createPrivateKey({ key: Buffer.from(priv, "base64"), format: "der", type: "pkcs8" });
  const datos: DatosLicencia = { v: 1, id: crypto.randomUUID().slice(0, 8), f: new Date().toISOString().slice(0, 10), ...d };
  const payload = Buffer.from(JSON.stringify(datos), "utf8");
  return `ORDZ1.${b64u(payload)}.${b64u(crypto.sign(null, payload, key))}`;
}

export type EstadoLicencia =
  | { modo: "nube" }
  | { modo: "activa"; datos: DatosLicencia }
  | { modo: "prueba"; dias: number }
  | { modo: "vencida" };

export function estadoLicencia(t: { licenciaClave: string | null; creado: Date }): EstadoLicencia {
  if (!MODO_LOCAL) return { modo: "nube" };
  if (t.licenciaClave) {
    const r = verificarLicencia(t.licenciaClave);
    if (r.ok) return { modo: "activa", datos: r.datos };
  }
  const dias = DIAS_PRUEBA - Math.floor((Date.now() - t.creado.getTime()) / 864e5);
  return dias > 0 ? { modo: "prueba", dias } : { modo: "vencida" };
}

/** Direcciones para entrar desde otras cajas o tablets de la misma red. */
export function direccionesRed() {
  const port = process.env.PORT || "3000";
  const ips = Object.values(os.networkInterfaces()).flat().filter((i) => i && i.family === "IPv4" && !i.internal).map((i) => i!.address);
  return [`http://${os.hostname()}:${port}`, ...ips.map((ip) => `http://${ip}:${port}`)];
}
