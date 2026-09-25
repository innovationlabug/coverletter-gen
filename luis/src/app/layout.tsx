import type { Metadata, Viewport } from "next";
import { Hanken_Grotesk, Newsreader } from "next/font/google";
import { ServiceWorkerRegister } from "@/components/ServiceWorkerRegister";
import "./globals.css";

const sans = Hanken_Grotesk({ subsets: ["latin", "latin-ext"], variable: "--font-sans", display: "swap" });
const serif = Newsreader({
  subsets: ["latin", "latin-ext"],
  variable: "--font-serif",
  style: ["normal", "italic"],
  axes: ["opsz"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Carta y copia — carta de interés con nota privada",
  description:
    "Genera tu carta de interés con IA y una nota privada de negociación salarial que nunca sale de tu dispositivo.",
  applicationName: "Carta y copia",
  appleWebApp: { capable: true, title: "Carta y copia", statusBarStyle: "default" },
  icons: { icon: "/icons/icon-192.png", apple: "/icons/icon-192.png" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#eef2f1" },
    { media: "(prefers-color-scheme: dark)", color: "#121a1d" },
  ],
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es-GT" className={`${sans.variable} ${serif.variable}`}>
      <body>
        {children}
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
