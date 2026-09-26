"use client";

import Link from "next/link";

export default function Error({ retry, reset }: { error: Error & { digest?: string }; retry?: () => void; reset?: () => void }) {
  const again = retry ?? reset;
  return (
    <main className="main status-page" id="contenido">
      <p className="eyebrow">Algo salió mal</p>
      <h1>No pudimos cargar esta página</h1>
      <p className="lede">Fue un problema de nuestro lado. Intenta de nuevo; si sigue pasando, vuelve al inicio en unos minutos.</p>
      <div className="problem-actions">
        {again && (
          <button type="button" className="primary compact" onClick={() => again()}>
            Intentar de nuevo
          </button>
        )}
        <Link href="/" className="link">
          Ir al inicio
        </Link>
      </div>
    </main>
  );
}
