import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Cathy · carta de interés",
    short_name: "Cathy",
    description: "Carta de interés lista para enviar y una nota privada para negociar tu salario. Funciona sin conexión.",
    start_url: "/",
    display: "standalone",
    background_color: "#eef1f5",
    theme_color: "#eef1f5",
    lang: "es-GT",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/icon.svg", sizes: "any", type: "image/svg+xml" },
    ],
  };
}
