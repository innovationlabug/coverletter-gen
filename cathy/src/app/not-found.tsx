import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Página no encontrada" };

export default function NotFound() {
  return (
    <main className="main status-page" id="contenido">
      <p className="eyebrow">Error 404</p>
      <h1>Esta página no existe</h1>
      <p className="lede">Puede que el enlace esté incompleto o que la página se haya movido. Tu carta te espera en el inicio.</p>
      <Link href="/" className="primary compact" data-testid="home-link">
        Ir al inicio
      </Link>
    </main>
  );
}
