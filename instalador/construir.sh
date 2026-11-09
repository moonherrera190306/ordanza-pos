#!/usr/bin/env bash
# Arma la versión local de Ordanza POS.
#   instalador/construir.sh            → dist/OrdanzaPOS-Setup-<versión>.exe  (Windows x64)
#   instalador/construir.sh linux      → dist/ordanza-linux/                 (solo para probar el lanzador)
# Requiere: Node 22, npm, y en Linux/Mac el makensis de NSIS (se descarga solo si no está).
set -euo pipefail
cd "$(dirname "$0")/.."
OBJ=${1:-windows}
VERSION=$(node -p "require('./package.json').version")
NODE_VER=22.23.4
PG_VER=17.10.0-beta.17
CACHE=instalador/.cache
OUT=dist/ordanza-$OBJ
mkdir -p "$CACHE" dist

echo "▸ Compilando la app (standalone)…"
BUILD_STANDALONE=1 NEXT_TELEMETRY_DISABLED=1 npx next build >/dev/null
rm -rf "$OUT" && mkdir -p "$OUT"/{app,migraciones,lanzador}
cp -r .next/standalone/. "$OUT/app/"
mkdir -p "$OUT/app/.next" && cp -r .next/static "$OUT/app/.next/static" && cp -r public "$OUT/app/public"
rm -rf "$OUT/app/node_modules/@img"/sharp-{linux,linuxmusl,darwin}* "$OUT/app/node_modules/@img"/sharp-libvips-* "$OUT/app/.env"* 2>/dev/null || true
cp instalador/migraciones/*.sql "$OUT/migraciones/"
cp instalador/lanzador/ordanza.mjs "$OUT/lanzador/"

fetch() { # paquete versión → carpeta extraída
  local d="$CACHE/$(echo "$1" | tr '/@' '__')-$2"
  if [ ! -d "$d" ]; then
    (cd "$CACHE" && npm pack "$1@$2" -q >/dev/null)
    mkdir -p "$d" && tar xzf "$CACHE"/$(echo "${1#@}" | tr '/' '-')-"$2".tgz -C "$d"
  fi
  echo "$d/package"
}

if [ "$OBJ" = linux ]; then
  PG=$(fetch @embedded-postgres/linux-x64 $PG_VER)
  cp -r "$PG/native" "$OUT/pgsql"
  (cd "$OUT/pgsql" && node -e '
    const fs=require("fs");const l=JSON.parse(fs.readFileSync("pg-symlinks.json","utf8"));
    const p=require("path");for (const s of l){try{fs.symlinkSync(p.basename(s.source), s.target.replace(/^native\//,""))}catch{}}')
  chmod +x "$OUT"/pgsql/bin/*
  echo "✓ $OUT listo (node $OUT/lanzador/ordanza.mjs)"
  exit 0
fi

NODE=$(fetch node-win-x64 $NODE_VER)
PG=$(fetch @embedded-postgres/windows-x64 $PG_VER)
mkdir -p "$OUT/node" && cp "$NODE/bin/node.exe" "$OUT/node/"
cp -r "$PG/native" "$OUT/pgsql"
rm -f "$OUT"/pgsql/bin/wx*.dll "$OUT"/pgsql/bin/testplug.dll
# Postgres necesita el runtime de Visual C++; se incluye junto a los .exe (despliegue local permitido por Microsoft).
VCRT=14.44.35112
if [ ! -f "$CACHE/vcrt-$VCRT/vcruntime140.dll" ]; then
  pip download "msvc-runtime==$VCRT" --platform win_amd64 --only-binary=:all: --no-deps -q -d "$CACHE/vcrt-$VCRT"
  python3 -c "import zipfile,glob,os,sys;d=sys.argv[1];z=zipfile.ZipFile(glob.glob(d+'/*.whl')[0])
for n in z.namelist():
  b=os.path.basename(n)
  if '/Scripts/' in n and b in ('vcruntime140.dll','vcruntime140_1.dll','msvcp140.dll'): open(os.path.join(d,b),'wb').write(z.read(n))" "$CACHE/vcrt-$VCRT"
fi
cp "$CACHE/vcrt-$VCRT"/{vcruntime140.dll,vcruntime140_1.dll,msvcp140.dll} "$OUT/pgsql/bin/"
cp instalador/windows/{ordanza.vbs,ordanza.ico,"Respaldar ahora.cmd","Restaurar respaldo.cmd"} "$OUT/"

MAKENSIS=$(command -v makensis || true)
if [ -z "$MAKENSIS" ]; then
  N="$CACHE/nsis"
  if [ ! -x "$N/linux/makensis" ]; then
    curl -sSL -o "$CACHE/nsis.7z" https://github.com/electron-userland/electron-builder-binaries/releases/download/nsis-3.0.4.1/nsis-3.0.4.1.7z
    Z=$(fetch 7zip-bin 5.2.0)/linux/x64/7za && chmod +x "$Z"
    "$Z" x -y -o"$N" "$CACHE/nsis.7z" >/dev/null
    chmod +x "$N/linux/makensis"
  fi
  export NSISDIR="$(cd "$N" && pwd)"
  MAKENSIS="$NSISDIR/linux/makensis"
fi
echo "▸ Empaquetando instalador…"
"$MAKENSIS" -V2 -DVERSION="$VERSION" -DORIGEN="$(cd "$OUT" && pwd)" -DSALIDA="$(pwd)/dist/OrdanzaPOS-Setup-$VERSION.exe" instalador/windows/instalador.nsi
ls -lh "dist/OrdanzaPOS-Setup-$VERSION.exe"
