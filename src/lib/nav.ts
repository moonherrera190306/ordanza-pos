import type { IconName } from "@/components/Icon";

export type RolKey = "ADMIN" | "CAJERO" | "ALMACEN";
const ALL: RolKey[] = ["ADMIN", "CAJERO", "ALMACEN"];

export const NAV: { href: string; label: string; icon: IconName; roles: RolKey[] }[] = [
  { href: "/inicio", label: "Inicio", icon: "home", roles: ALL },
  { href: "/venta", label: "Vender", icon: "cart", roles: ["ADMIN", "CAJERO"] },
  { href: "/escanear", label: "Escanear", icon: "scan", roles: ALL },
  { href: "/clientes", label: "Clientes", icon: "users", roles: ["ADMIN", "CAJERO"] },
  { href: "/agenda", label: "Agenda", icon: "cal", roles: ALL },
  { href: "/productos", label: "Productos", icon: "box", roles: ALL },
  { href: "/inventario", label: "Inventario", icon: "layers", roles: ["ADMIN", "ALMACEN"] },
  { href: "/compras", label: "Compras", icon: "truck", roles: ["ADMIN", "ALMACEN"] },
  { href: "/etiquetas", label: "Etiquetas", icon: "tag", roles: ["ADMIN", "ALMACEN"] },
  { href: "/reportes", label: "Reportes", icon: "chart", roles: ["ADMIN"] },
  { href: "/bitacora", label: "Bitácora", icon: "list", roles: ["ADMIN"] },
  { href: "/ajustes", label: "Ajustes", icon: "gear", roles: ["ADMIN"] },
];

export const GROUPS = [
  { label: "Operación", hrefs: ["/inicio", "/venta", "/escanear", "/clientes", "/agenda"] },
  { label: "Catálogo", hrefs: ["/productos", "/inventario", "/compras", "/etiquetas"] },
  { label: "Administración", hrefs: ["/reportes", "/bitacora", "/ajustes"] },
];

export const canSee = (rol: RolKey, href: string) => !!NAV.find((n) => href.startsWith(n.href) && n.roles.includes(rol));
