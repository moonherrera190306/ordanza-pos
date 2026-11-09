// Lanzador de Ordanza POS (versión local).
// Arranca Postgres embebido, aplica migraciones, levanta el servidor y abre la ventana del sistema.
//
//   node ordanza.mjs                  → servidor (lo usa el inicio automático de Windows)
//   node ordanza.mjs --abrir          → asegura que el servidor esté arriba y abre la ventana
//   node ordanza.mjs --respaldar      → respaldo inmediato
//   node ordanza.mjs --restaurar F    → restaura el respaldo F (archivo .json.gz)
//   node ordanza.mjs --detener        → detiene la base de datos

import { spawn, spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import zlib from "node:zlib";

const WIN = process.platform === "win32";
const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const APP = path.join(RAIZ, "app");
const PGBIN = path.join(RAIZ, "pgsql", "bin");
const MIGRACIONES = path.join(RAIZ, "migraciones");
const DATOS = process.env.ORDANZA_DATOS || (WIN ? path.join(process.env.ProgramData || "C:\\ProgramData", "OrdanzaPOS") : path.join(os.homedir(), ".ordanza-pos"));
const PGDATA = path.join(DATOS, "pgdata");
const RESPALDOS = [path.join(os.homedir(), "Documents", "Ordanza Respaldos"), path.join(DATOS, "respaldos")];
const exe = (n) => path.join(PGBIN, WIN ? `${n}.exe` : n);
const require = createRequire(path.join(APP, "package.json"));

fs.mkdirSync(DATOS, { recursive: true });
const LOG = path.join(DATOS, "ordanza.log");
function log(...a) {
  const line = `[${new Date().toISOString()}] ${a.join(" ")}\n`;
  try {
    if (fs.existsSync(LOG) && fs.statSync(LOG).size > 5e6) fs.renameSync(LOG, LOG + ".1");
    fs.appendFileSync(LOG, line);
  } catch {}
  if (process.stdout.isTTY) process.stdout.write(line);
}

function config() {
  const f = path.join(DATOS, "config.json");
  let c = {};
  try { c = JSON.parse(fs.readFileSync(f, "utf8")); } catch {}
  const def = { puerto: 3000, pgPuerto: 54329, pgPassword: crypto.randomBytes(18).toString("base64url"), authSecret: crypto.randomBytes(32).toString("base64") };
  const out = { ...def, ...c };
  if (JSON.stringify(out) !== JSON.stringify(c)) fs.writeFileSync(f, JSON.stringify(out, null, 2));
  return out;
}
const CFG = config();
const URL_LOCAL = `http://127.0.0.1:${CFG.puerto}`;
const dbUrl = (db = "ordanza") => `postgresql://ordanza:${encodeURIComponent(CFG.pgPassword)}@127.0.0.1:${CFG.pgPuerto}/${db}`;

function arriba(timeout = 1500) {
  return new Promise((res) => {
    const r = http.get(URL_LOCAL + "/login", { timeout }, (x) => { x.resume(); res(x.statusCode < 500); });
    r.on("error", () => res(false));
    r.on("timeout", () => { r.destroy(); res(false); });
  });
}
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- Postgres ----------
function pgctl(args) {
  return spawnSync(exe("pg_ctl"), args, { stdio: "ignore", windowsHide: true }).status;
}

function iniciarPostgres() {
  if (!fs.existsSync(path.join(PGDATA, "PG_VERSION"))) {
    log("Creando base de datos por primera vez…");
    fs.mkdirSync(PGDATA, { recursive: true });
    const pw = path.join(DATOS, "pw.tmp");
    fs.writeFileSync(pw, CFG.pgPassword);
    const r = spawnSync(exe("initdb"), ["-D", PGDATA, "-U", "ordanza", `--pwfile=${pw}`, "-A", "scram-sha-256", "-E", "UTF8", "--locale=C"], { encoding: "utf8", windowsHide: true });
    fs.rmSync(pw, { force: true });
    if (r.status !== 0) throw new Error("initdb falló: " + (r.stderr || r.stdout));
  }
  if (pgctl(["status", "-D", PGDATA]) === 0) return;
  log("Iniciando base de datos…");
  const st = pgctl(["start", "-D", PGDATA, "-w", "-t", "90", "-l", path.join(DATOS, "postgres.log"), "-o", `-p ${CFG.pgPuerto} -c listen_addresses=127.0.0.1`]);
  if (st !== 0) throw new Error("No arrancó Postgres; revisa " + path.join(DATOS, "postgres.log"));
}

async function cliente(db = "ordanza") {
  const { Client } = require("pg");
  const c = new Client({ connectionString: dbUrl(db) });
  await c.connect();
  return c;
}

async function prepararBase() {
  const c0 = await cliente("postgres");
  const ex = await c0.query("SELECT 1 FROM pg_database WHERE datname='ordanza'");
  if (!ex.rowCount) await c0.query("CREATE DATABASE ordanza");
  await c0.end();
  const c = await cliente();
  await c.query('CREATE TABLE IF NOT EXISTS "_ordanza_migraciones"(nombre text PRIMARY KEY, aplicada timestamptz NOT NULL DEFAULT now())');
  const hechas = new Set((await c.query('SELECT nombre FROM "_ordanza_migraciones"')).rows.map((r) => r.nombre));
  for (const f of fs.readdirSync(MIGRACIONES).filter((x) => x.endsWith(".sql")).sort()) {
    if (hechas.has(f)) continue;
    log("Aplicando migración", f);
    await c.query("BEGIN");
    try {
      await c.query(fs.readFileSync(path.join(MIGRACIONES, f), "utf8"));
      await c.query('INSERT INTO "_ordanza_migraciones"(nombre) VALUES ($1)', [f]);
      await c.query("COMMIT");
    } catch (e) {
      await c.query("ROLLBACK");
      throw new Error(`Migración ${f}: ${e.message}`);
    }
  }
  await c.end();
}

// ---------- Respaldos ----------
async function respaldar(nombre = `ordanza-${new Date().toISOString().slice(0, 10)}.json.gz`) {
  const c = await cliente();
  const tablas = (await c.query("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename")).rows.map((r) => r.tablename);
  const partes = [];
  for (const t of tablas) {
    const r = await c.query(`SELECT coalesce(json_agg(x), '[]'::json)::text AS j FROM "${t}" x`);
    partes.push(`${JSON.stringify(t)}:${r.rows[0].j}`);
  }
  await c.end();
  const cuerpo = `{"formato":"ordanza-pos-local/1","generado":${JSON.stringify(new Date().toISOString())},"tablas":{${partes.join(",")}}}`;
  const gz = zlib.gzipSync(cuerpo);
  const escritos = [];
  for (const dir of RESPALDOS) {
    try {
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, nombre), gz);
      escritos.push(dir);
      const viejos = fs.readdirSync(dir).filter((x) => /^ordanza-\d{4}-\d{2}-\d{2}\.json\.gz$/.test(x)).sort().slice(0, -30);
      for (const v of viejos) fs.rmSync(path.join(dir, v), { force: true });
    } catch (e) { log("No se pudo escribir respaldo en", dir, e.message); }
  }
  log("Respaldo listo:", nombre, "→", escritos.join(" | "));
  return escritos.length ? path.join(escritos[0], nombre) : null;
}

function respaldoDeHoyExiste() {
  const nombre = `ordanza-${new Date().toISOString().slice(0, 10)}.json.gz`;
  return RESPALDOS.some((d) => fs.existsSync(path.join(d, nombre)));
}

async function restaurar(archivo) {
  const datos = JSON.parse(zlib.gunzipSync(fs.readFileSync(archivo)).toString("utf8"));
  if (!String(datos.formato).startsWith("ordanza-pos-local/")) throw new Error("Ese archivo no es un respaldo de Ordanza POS.");
  log("Respaldo de seguridad antes de restaurar…");
  await respaldar(`antes-de-restaurar-${new Date().toISOString().replace(/[:.]/g, "-")}.json.gz`);
  const c = await cliente();
  const tablas = Object.keys(datos.tablas).filter((t) => t !== "_ordanza_migraciones");
  await c.query("BEGIN");
  try {
    await c.query("SET LOCAL session_replication_role = replica");
    await c.query(`TRUNCATE ${tablas.map((t) => `"${t}"`).join(",")} CASCADE`);
    for (const t of tablas) {
      if (!datos.tablas[t].length) continue;
      await c.query(`INSERT INTO "${t}" SELECT * FROM json_populate_recordset(NULL::"${t}", $1::json)`, [JSON.stringify(datos.tablas[t])]);
    }
    await c.query("COMMIT");
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  }
  await c.end();
  log("Restaurado desde", archivo);
}

// ---------- Ventana ----------
function abrirVentana() {
  const url = `http://localhost:${CFG.puerto}`;
  const pf = [process.env["ProgramFiles(x86)"], process.env.ProgramFiles, process.env.LOCALAPPDATA].filter(Boolean);
  const candidatos = WIN
    ? pf.flatMap((p) => [path.join(p, "Microsoft", "Edge", "Application", "msedge.exe"), path.join(p, "Google", "Chrome", "Application", "chrome.exe")])
    : ["/usr/bin/google-chrome", "/usr/bin/chromium"];
  const nav = candidatos.find((p) => fs.existsSync(p));
  if (nav) {
    const perfil = path.join(DATOS, "navegador");
    spawn(nav, [`--app=${url}`, `--user-data-dir=${perfil}`, "--kiosk-printing", "--no-first-run", "--no-default-browser-check", "--start-maximized", "--disable-features=Translate"], { detached: true, stdio: "ignore", windowsHide: false }).unref();
  } else if (WIN) spawn("cmd", ["/c", "start", "", url], { detached: true, stdio: "ignore", windowsHide: true }).unref();
}

// ---------- Servidor ----------
async function servidor() {
  if (await arriba()) { log("El servidor ya estaba arriba."); return; }
  iniciarPostgres();
  await prepararBase();
  Object.assign(process.env, {
    NODE_ENV: "production", MODO: "local", PORT: String(CFG.puerto), HOSTNAME: "0.0.0.0",
    DATABASE_URL: dbUrl(), AUTH_SECRET: CFG.authSecret, NEXT_TELEMETRY_DISABLED: "1",
  });
  log(`Iniciando Ordanza POS en ${URL_LOCAL} (red local: http://${os.hostname()}:${CFG.puerto})`);
  process.chdir(APP);
  await import(pathToFileURL(path.join(APP, "server.js")).href);
  const revisar = async () => {
    try { if (!respaldoDeHoyExiste()) await respaldar(); } catch (e) { log("Respaldo falló:", e.message); }
  };
  setTimeout(revisar, 90_000);
  setInterval(revisar, 3_600_000);
}

const [cmd, arg] = process.argv.slice(2);
process.on("uncaughtException", (e) => log("ERROR", e.stack || e.message));
try {
  if (cmd === "--abrir") {
    if (!(await arriba())) {
      spawn(process.execPath, [fileURLToPath(import.meta.url)], { detached: true, stdio: "ignore", windowsHide: true }).unref();
      for (let i = 0; i < 120 && !(await arriba()); i++) await esperar(1000);
    }
    abrirVentana();
  } else if (cmd === "--respaldar") {
    iniciarPostgres();
    const f = await respaldar();
    console.log(f ? `Respaldo guardado en:\n${f}` : "No se pudo guardar el respaldo.");
  } else if (cmd === "--restaurar") {
    if (!arg || !fs.existsSync(arg)) throw new Error("Indica el archivo de respaldo (.json.gz).");
    iniciarPostgres();
    await restaurar(arg);
    console.log("Listo. Cierra y vuelve a abrir Ordanza POS.");
  } else if (cmd === "--detener") {
    pgctl(["stop", "-D", PGDATA, "-m", "fast"]);
  } else await servidor();
} catch (e) {
  log("ERROR", e.stack || e.message);
  console.error(e.message);
  process.exitCode = 1;
}
