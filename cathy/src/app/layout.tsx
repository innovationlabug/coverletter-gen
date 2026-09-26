import type { Metadata, Viewport } from "next";
import { Newsreader, Public_Sans } from "next/font/google";
import { SwRegister } from "@/components/SwRegister";
import "./globals.css";

const serif = Newsreader({ subsets: ["latin"], style: ["normal", "italic"], variable: "--font-serif", display: "swap" });
const sans = Public_Sans({ subsets: ["latin"], variable: "--font-sans", display: "swap" });

export const metadata: Metadata = {
  title: "Cathy · carta de interés",
  description: "Una carta de interés lista para enviar con tu CV y una nota privada para negociar tu salario.",
  applicationName: "Cathy",
  icons: { icon: "/icons/icon.svg", apple: "/icons/icon-192.png" },
};

export const viewport: Viewport = {
  themeColor: "#f6f6f3",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es-GT" className={`${serif.variable} ${sans.variable}`}>
      <body>
        {children}
        <SwRegister />
      </body>
    </html>
  );
}
