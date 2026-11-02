import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Ordanza POS",
    short_name: "Ordanza",
    description: "Inventario y punto de venta multicaja.",
    start_url: "/venta",
    display: "standalone",
    background_color: "#0B1A3F",
    theme_color: "#0B1A3F",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }],
  };
}
