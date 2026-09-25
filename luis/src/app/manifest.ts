import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Carta y copia",
    short_name: "Carta y copia",
    description: "Carta de interés con IA + nota privada de negociación que no sale de tu dispositivo.",
    lang: "es-GT",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#e9edf2",
    theme_color: "#26408f",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
