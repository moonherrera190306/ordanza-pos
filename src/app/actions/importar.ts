"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAction } from "@/lib/auth";
import { bitacora } from "@/lib/log";
import { run, UserError } from "@/lib/action";
import { n, norm, r2, r3 } from "@/lib/format";

const Fila = z.object({
  fila: z.number(),
  nombre: z.string().trim().min(1).max(160),
  codigo: z.string().trim().max(64).optional(),
  sku: z.string().trim().max(64).optional(),
  categoria: z.string().trim().max(60).optional(),
  unidad: z.string().trim().max(20).optional(),
  precio: z.number().min(0),
  costo: z.number().min(0).optional(),
  existencia: z.number().optional(),
  minimo: z.number().min(0).optional(),
  proveedor: z.string().trim().max(120).optional(),
  ubicacion: z.string().trim().max(120).optional(),
});
export type FilaImport = z.input<typeof Fila>;

const Opts = z.object({ existentes: z.enum(["actualizar", "omitir"]), existencia: z.enum(["reemplazar", "sumar"]) });
export type ResultadoImport = { creados: number; actualizados: number; omitidos: number; errores: { fila: number; error: string }[] };

/** Importa un bloque de filas (máx. 250). Empata por código, luego SKU, luego nombre exacto. */
export async function importarProductos(filas: FilaImport[], opts: z.input<typeof Opts>, ultimo: boolean) {
  return run<ResultadoImport>(async () => {
    const s = await requireAction(["ADMIN", "ALMACEN"]);
    const o = Opts.parse(opts);
    if (filas.length > 250) throw new UserError("Envía bloques de 250 filas como máximo.");
    const res: ResultadoImport = { creados: 0, actualizados: 0, omitidos: 0, errores: [] };

    const existentes = await prisma.producto.findMany({ where: { tenantId: s.tid }, select: { id: true, nombre: true, codigo: true, sku: true, esServicio: true } });
    const porCodigo = new Map(existentes.filter((p) => p.codigo).map((p) => [p.codigo!.toLowerCase(), p]));
    const porSku = new Map(existentes.filter((p) => p.sku).map((p) => [p.sku!.toLowerCase(), p]));
    const porNombre = new Map(existentes.map((p) => [norm(p.nombre), p]));
    const cats = new Map((await prisma.categoria.findMany({ where: { tenantId: s.tid } })).map((c) => [norm(c.nombre), c.id]));
    const ids = existentes.map((p) => p.id);
    const st = ids.length ? await prisma.movimiento.groupBy({ by: ["productoId"], where: { tenantId: s.tid }, _sum: { cantidad: true } }) : [];
    const stock = new Map(st.map((r) => [r.productoId, n(r._sum.cantidad)]));
    const usados = new Set<string>(); // códigos usados en este bloque

    for (const raw of filas) {
      const parsed = Fila.safeParse(raw);
      if (!parsed.success) { res.errores.push({ fila: raw.fila, error: "Falta el nombre o el precio no es válido." }); continue; }
      const d = parsed.data;
      try {
        const cod = d.codigo?.toLowerCase();
        if (cod && usados.has(cod)) { res.errores.push({ fila: d.fila, error: `El código ${d.codigo} viene repetido en el archivo.` }); continue; }
        if (cod) usados.add(cod);
        const prev = (cod && porCodigo.get(cod)) || (d.sku && porSku.get(d.sku.toLowerCase())) || porNombre.get(norm(d.nombre));
        if (prev && o.existentes === "omitir") { res.omitidos++; continue; }

        let categoriaId: string | null | undefined;
        if (d.categoria) {
          categoriaId = cats.get(norm(d.categoria));
          if (!categoriaId) {
            const c = await prisma.categoria.upsert({ where: { tenantId_nombre: { tenantId: s.tid, nombre: d.categoria } }, create: { tenantId: s.tid, nombre: d.categoria }, update: {} });
            categoriaId = c.id;
            cats.set(norm(d.categoria), c.id);
          }
        }
        const unidad = (d.unidad || "pza").toLowerCase();
        const esServicio = unidad === "servicio";
        const data = {
          nombre: d.nombre, precio: r2(d.precio), unidad, esServicio,
          ...(d.codigo ? { codigo: d.codigo } : {}), ...(d.sku ? { sku: d.sku } : {}),
          ...(categoriaId !== undefined ? { categoriaId } : {}),
          ...(d.costo !== undefined ? { costo: r2(d.costo) } : {}), ...(d.minimo !== undefined ? { minimo: r3(d.minimo) } : {}),
          ...(d.proveedor ? { proveedor: d.proveedor } : {}), ...(d.ubicacion ? { ubicacion: d.ubicacion } : {}),
        };
        await prisma.$transaction(async (tx) => {
          if (prev) {
            await tx.producto.update({ where: { id: prev.id }, data });
            if (d.existencia !== undefined && !esServicio) {
              const antes = stock.get(prev.id) ?? 0;
              const delta = o.existencia === "reemplazar" ? r3(d.existencia - antes) : r3(d.existencia);
              if (delta !== 0)
                await tx.movimiento.create({
                  data: {
                    tenantId: s.tid, productoId: prev.id, tipo: o.existencia === "reemplazar" ? "AJUSTE" : "ENTRADA", cantidad: delta,
                    costoUnit: d.costo, nota: "Importación de Excel", usuarioId: s.user.id, usuarioNombre: s.user.nombre,
                  },
                });
            }
            res.actualizados++;
          } else {
            const p = await tx.producto.create({ data: { ...data, tenantId: s.tid } });
            if (d.existencia && d.existencia > 0 && !esServicio)
              await tx.movimiento.create({
                data: { tenantId: s.tid, productoId: p.id, tipo: "INICIAL", cantidad: r3(d.existencia), costoUnit: d.costo ?? 0, nota: "Importación de Excel", usuarioId: s.user.id, usuarioNombre: s.user.nombre },
              });
            porNombre.set(norm(p.nombre), { id: p.id, nombre: p.nombre, codigo: p.codigo, sku: p.sku, esServicio });
            if (p.codigo) porCodigo.set(p.codigo.toLowerCase(), { id: p.id, nombre: p.nombre, codigo: p.codigo, sku: p.sku, esServicio });
            res.creados++;
          }
        });
      } catch (e) {
        const code = (e as { code?: string })?.code;
        res.errores.push({ fila: d.fila, error: code === "P2002" ? `El código ${d.codigo} ya es de otro producto.` : "No se pudo guardar." });
      }
    }
    if (ultimo) revalidatePath("/", "layout");
    await bitacora(s, "Productos", "Importación de Excel", `${res.creados} nuevos · ${res.actualizados} actualizados · ${res.omitidos} omitidos · ${res.errores.length} con error`);
    return res;
  });
}
