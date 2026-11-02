"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAction } from "@/lib/auth";
import { bitacora } from "@/lib/log";
import { run, UserError } from "@/lib/action";
import { money, n, qty, r3 } from "@/lib/format";

const ProductoIn = z.object({
  id: z.string().optional(),
  nombre: z.string().trim().min(1, "El nombre es obligatorio.").max(160),
  codigo: z.string().trim().max(64).optional(),
  sku: z.string().trim().max(64).optional(),
  categoria: z.string().trim().max(60).optional(),
  unidad: z.string().trim().max(20).default("pza"),
  precio: z.number().min(0, "El precio no puede ser negativo."),
  costo: z.number().min(0).default(0),
  minimo: z.number().min(0).default(0),
  stockInicial: z.number().min(0).optional(),
  proveedor: z.string().trim().max(120).optional(),
  ubicacion: z.string().trim().max(120).optional(),
  activo: z.boolean().default(true),
});
export type ProductoInput = z.input<typeof ProductoIn>;

const blank = (s?: string) => (s && s.length ? s : null);

export async function guardarProducto(input: ProductoInput) {
  return run(async () => {
    const s = await requireAction(["ADMIN", "ALMACEN"]);
    const d = ProductoIn.parse(input);
    const esServicio = d.unidad === "servicio";
    let categoriaId: string | null = null;
    if (d.categoria) {
      const c = await prisma.categoria.upsert({
        where: { tenantId_nombre: { tenantId: s.tid, nombre: d.categoria } },
        create: { tenantId: s.tid, nombre: d.categoria },
        update: {},
      });
      categoriaId = c.id;
    }
    const data = {
      nombre: d.nombre, codigo: blank(d.codigo), sku: blank(d.sku), categoriaId, unidad: d.unidad, esServicio,
      precio: d.precio, costo: d.costo, minimo: d.minimo, proveedor: blank(d.proveedor), ubicacion: blank(d.ubicacion), activo: d.activo,
    };
    if (!d.id) {
      const p = await prisma.$transaction(async (tx) => {
        const p = await tx.producto.create({ data: { ...data, tenantId: s.tid } });
        if (d.stockInicial && !esServicio)
          await tx.movimiento.create({
            data: { tenantId: s.tid, productoId: p.id, tipo: "INICIAL", cantidad: r3(d.stockInicial), costoUnit: d.costo, nota: "Inventario inicial", usuarioId: s.user.id, usuarioNombre: s.user.nombre },
          });
        return p;
      });
      await bitacora(s, "Productos", "Alta", `${p.nombre} · ${money(d.precio)}`);
    } else {
      const prev = await prisma.producto.findFirst({ where: { id: d.id, tenantId: s.tid } });
      if (!prev) throw new UserError("No encontré el producto.");
      await prisma.producto.update({ where: { id: prev.id }, data });
      const ch: string[] = [];
      if (n(prev.precio) !== d.precio) ch.push(`precio ${money(prev.precio)} → ${money(d.precio)}`);
      if (n(prev.costo) !== d.costo) ch.push(`costo ${money(prev.costo)} → ${money(d.costo)}`);
      if (prev.nombre !== d.nombre) ch.push("nombre");
      if (prev.activo !== d.activo) ch.push(d.activo ? "activado" : "desactivado");
      await bitacora(s, "Productos", "Edición", `${d.nombre}${ch.length ? " · " + ch.join(", ") : ""}`);
    }
    revalidatePath("/", "layout");
  }, input.id ? "Cambios guardados" : "Producto creado");
}

export async function eliminarProducto(id: string) {
  return run(async () => {
    const s = await requireAction(["ADMIN"]);
    const p = await prisma.producto.findFirst({ where: { id, tenantId: s.tid } });
    if (!p) throw new UserError("No encontré el producto.");
    const vendido = await prisma.ventaItem.count({ where: { productoId: id } });
    if (vendido) {
      await prisma.producto.update({ where: { id }, data: { activo: false } });
      await bitacora(s, "Productos", "Desactivación", `${p.nombre} (tiene ventas, no se puede borrar)`);
      return "desactivado";
    }
    await prisma.producto.delete({ where: { id } });
    await bitacora(s, "Productos", "Eliminación", p.nombre);
    revalidatePath("/", "layout");
    return "eliminado";
  });
}

export async function generarCodigo() {
  const s = await requireAction(["ADMIN", "ALMACEN"]);
  for (;;) {
    const c = "20" + String(Math.floor(Math.random() * 1e10)).padStart(10, "0");
    if (!(await prisma.producto.findFirst({ where: { tenantId: s.tid, codigo: c }, select: { id: true } }))) return c;
  }
}

const MovIn = z.object({
  productoId: z.string(),
  tipo: z.enum(["ENTRADA", "SALIDA", "AJUSTE"]),
  cantidad: z.number().min(0),
  nota: z.string().trim().max(200).optional(),
});

/** ENTRADA/SALIDA suman o restan; AJUSTE recibe la existencia contada y registra la diferencia. */
export async function moverInventario(input: z.input<typeof MovIn>) {
  return run(async () => {
    const s = await requireAction(["ADMIN", "ALMACEN"]);
    const d = MovIn.parse(input);
    if (d.tipo !== "AJUSTE" && d.cantidad <= 0) throw new UserError("Escribe una cantidad mayor a cero.");
    const r = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Producto" WHERE id = ${d.productoId} AND "tenantId" = ${s.tid} FOR UPDATE`;
      const p = await tx.producto.findFirst({ where: { id: d.productoId, tenantId: s.tid } });
      if (!p) throw new UserError("No encontré el producto.");
      if (p.esServicio) throw new UserError("Los servicios no llevan inventario.");
      const agg = await tx.movimiento.aggregate({ where: { tenantId: s.tid, productoId: p.id }, _sum: { cantidad: true } });
      const antes = r3(n(agg._sum.cantidad));
      const delta = d.tipo === "ENTRADA" ? d.cantidad : d.tipo === "SALIDA" ? -d.cantidad : r3(d.cantidad - antes);
      if (delta === 0) throw new UserError("La existencia contada es igual a la registrada; no hay nada que ajustar.");
      await tx.movimiento.create({
        data: { tenantId: s.tid, productoId: p.id, tipo: d.tipo, cantidad: r3(delta), costoUnit: p.costo, nota: d.nota || null, usuarioId: s.user.id, usuarioNombre: s.user.nombre },
      });
      return { p, antes, despues: r3(antes + delta) };
    });
    const label = { ENTRADA: "Entrada", SALIDA: "Salida", AJUSTE: "Ajuste por conteo" }[d.tipo];
    await bitacora(s, "Inventario", label, `${r.p.nombre}: ${qty(r.antes)} → ${qty(r.despues)}${d.nota ? " · " + d.nota : ""}`);
    revalidatePath("/", "layout");
    return r.despues;
  }, "Movimiento registrado");
}

export type DetalleProducto = {
  id: string; nombre: string; codigo: string | null; sku: string | null; categoria: string | null; unidad: string; esServicio: boolean;
  precio: number; costo: number; minimo: number; stock: number; proveedor: string | null; ubicacion: string | null; activo: boolean;
  movs: { id: string; tipo: string; cantidad: number; usuario: string; nota: string | null; creado: string }[];
};

export async function detalleProducto(id: string) {
  return run<DetalleProducto>(async () => {
    const s = await requireAction();
    const p = await prisma.producto.findFirst({ where: { id, tenantId: s.tid }, include: { categoria: true } });
    if (!p) throw new UserError("No encontré el producto.");
    const [agg, movs] = await Promise.all([
      prisma.movimiento.aggregate({ where: { tenantId: s.tid, productoId: id }, _sum: { cantidad: true } }),
      prisma.movimiento.findMany({ where: { tenantId: s.tid, productoId: id }, orderBy: { creado: "desc" }, take: 12 }),
    ]);
    return {
      id: p.id, nombre: p.nombre, codigo: p.codigo, sku: p.sku, categoria: p.categoria?.nombre ?? null, unidad: p.unidad, esServicio: p.esServicio,
      precio: n(p.precio), costo: s.user.rol === "CAJERO" ? 0 : n(p.costo), minimo: n(p.minimo), stock: r3(n(agg._sum.cantidad)),
      proveedor: p.proveedor, ubicacion: p.ubicacion, activo: p.activo,
      movs: movs.map((m) => ({ id: m.id, tipo: m.tipo, cantidad: n(m.cantidad), usuario: m.usuarioNombre, nota: m.nota, creado: m.creado.toISOString() })),
    };
  });
}
