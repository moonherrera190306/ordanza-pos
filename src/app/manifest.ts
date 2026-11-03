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
    icons: [
      { src: "/brand/ordanza-placa-192.png", sizes: "192x192", type: "image/png" },
      { src: "/brand/ordanza-placa-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
