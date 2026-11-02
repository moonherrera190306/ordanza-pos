// Crea un negocio de demostración. Uso: npm run db:seed
import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });

async function main() {
  const slug = "demo";
  if (await prisma.tenant.findUnique({ where: { slug } })) {
    console.log("El negocio demo ya existe; no se hizo nada.");
    return;
  }
  const t = await prisma.tenant.create({
    data: { slug, nombre: "Papelería La Esquina", direccion: "Zamora, Michoacán", telefono: "351 000 0000" },
  });
  const [admin] = await Promise.all([
    prisma.usuario.create({
      data: {
        tenantId: t.id, nombre: "Administrador Demo", rol: "ADMIN", email: "admin@demo.mx",
        passwordHash: await bcrypt.hash("ordanza123", 10), pinHash: await bcrypt.hash("1234", 10),
      },
    }),
    prisma.usuario.create({ data: { tenantId: t.id, nombre: "Luis Cajero", rol: "CAJERO", pinHash: await bcrypt.hash("2222", 10) } }),
    prisma.usuario.create({ data: { tenantId: t.id, nombre: "Ana Almacén", rol: "ALMACEN", pinHash: await bcrypt.hash("3333", 10) } }),
  ]);
  await prisma.caja.createMany({
    data: [
      { tenantId: t.id, nombre: "Caja 1", clave: "C1" },
      { tenantId: t.id, nombre: "Caja 2", clave: "C2" },
    ],
  });
  const cats = ["Papelería", "Bebidas", "Electrónica", "Abarrotes", "Servicios"];
  const catId: Record<string, string> = {};
  for (const nombre of cats) catId[nombre] = (await prisma.categoria.create({ data: { tenantId: t.id, nombre } })).id;

  const prods: [string, string, string, number, number, number, number, string?][] = [
    ["Cuaderno profesional raya 100 h", "7501031311309", "Papelería", 45, 28, 36, 10],
    ["Bolígrafo azul punto mediano", "7501026702051", "Papelería", 8, 3.5, 140, 40],
    ["Lápiz adhesivo 21 g", "2000000000060", "Papelería", 26, 12, 30, 8],
    ["Agua natural 1 L", "7501086801046", "Bebidas", 14, 8, 6, 24],
    ["Refresco cola 600 ml", "7501055300075", "Bebidas", 22, 14, 48, 24],
    ["Cable USB-C 1 m", "2000000000015", "Electrónica", 129, 55, 12, 5],
    ["Audífonos alámbricos 3.5 mm", "2000000000022", "Electrónica", 149, 70, 0, 3],
    ["Azúcar estándar", "2000000000039", "Abarrotes", 32, 24, 25.5, 10, "kg"],
    ["Frijol bayo", "2000000000046", "Abarrotes", 38, 27, 8, 10, "kg"],
    ["Impresión a color carta", "2000000000053", "Servicios", 10, 2, 0, 0, "servicio"],
  ];
  for (const [nombre, codigo, cat, precio, costo, stock, minimo, unidad] of prods) {
    const esServicio = unidad === "servicio";
    const p = await prisma.producto.create({
      data: { tenantId: t.id, nombre, codigo, categoriaId: catId[cat], precio, costo, minimo, unidad: unidad ?? "pza", esServicio },
    });
    if (stock && !esServicio)
      await prisma.movimiento.create({
        data: { tenantId: t.id, productoId: p.id, tipo: "INICIAL", cantidad: stock, costoUnit: costo, nota: "Inventario inicial", usuarioId: admin.id, usuarioNombre: admin.nombre },
      });
  }
  console.log("Listo. Entra con admin@demo.mx / ordanza123 (PIN 1234). Cajero PIN 2222, almacén PIN 3333.");
}

main().finally(() => prisma.$disconnect());
