import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Cathy · carta dividida",
    short_name: "Cathy",
    description: "Carta de interés + nota privada de negociación. Funciona sin conexión.",
    start_url: "/",
    display: "standalone",
    background_color: "#f3efe4",
    theme_color: "#f3efe4",
    lang: "es-GT",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/icon.svg", sizes: "any", type: "image/svg+xml" },
    ],
  };
}
