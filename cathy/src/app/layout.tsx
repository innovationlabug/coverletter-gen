import type { Metadata, Viewport } from "next";
import { Newsreader, IBM_Plex_Mono, Caveat } from "next/font/google";
import { SwRegister } from "@/components/SwRegister";
import "./globals.css";

const serif = Newsreader({ subsets: ["latin"], style: ["normal", "italic"], variable: "--font-serif", display: "swap" });
const mono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-mono", display: "swap" });
const hand = Caveat({ subsets: ["latin"], weight: ["500", "700"], variable: "--font-hand", display: "swap" });

export const metadata: Metadata = {
  title: "Cathy · carta dividida",
  description: "Generador de cartas de interés con cerebro dividido: heurísticas en el navegador, Ollama privado en Cloud Run y Gemini solo con datos redactados.",
  applicationName: "Cathy",
  icons: { icon: "/icons/icon.svg", apple: "/icons/icon-192.png" },
};

export const viewport: Viewport = {
  themeColor: "#f3efe4",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es-GT" className={`${serif.variable} ${mono.variable} ${hand.variable}`}>
      <body>
        {children}
        <SwRegister />
      </body>
    </html>
  );
}
