// Genera una licencia local desde la terminal (requiere LICENCIA_PRIVADA en el entorno o en .env).
// Uso: node scripts/licencia.mjs "Ferretería López" 1A2B-3C4D-5E6F-7A8B 2
import crypto from "node:crypto";
import fs from "node:fs";

let priv = process.env.LICENCIA_PRIVADA;
if (!priv && fs.existsSync(".env")) priv = fs.readFileSync(".env", "utf8").match(/^LICENCIA_PRIVADA="?([^"\n]+)"?/m)?.[1];
const [negocio, equipo, cajas = "1"] = process.argv.slice(2);
if (!priv || !negocio || !/^[0-9A-F]{4}(-[0-9A-F]{4}){3}$/i.test(equipo ?? "")) {
  console.error('Uso: node scripts/licencia.mjs "Negocio" XXXX-XXXX-XXXX-XXXX [cajas]   (y LICENCIA_PRIVADA en .env)');
  process.exit(1);
}
const key = crypto.createPrivateKey({ key: Buffer.from(priv, "base64"), format: "der", type: "pkcs8" });
const datos = { v: 1, id: crypto.randomUUID().slice(0, 8), f: new Date().toISOString().slice(0, 10), n: negocio, e: equipo.toUpperCase(), c: Number(cajas) || 1 };
const payload = Buffer.from(JSON.stringify(datos), "utf8");
console.log(`ORDZ1.${payload.toString("base64url")}.${crypto.sign(null, payload, key).toString("base64url")}`);
