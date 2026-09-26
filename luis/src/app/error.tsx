"use client";

import Link from "next/link";
import { PageFrame } from "@/components/Brand";

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <PageFrame>
      <h1 className="page-title">Algo salió mal.</h1>
      <p className="page-lead">
        Tuvimos un problema al mostrar esta pantalla. Vuelve a intentarlo; si se repite, recarga la página.
      </p>
      <div className="page-actions">
        <button type="button" className="button-primary" onClick={() => reset()}>
          Intentar de nuevo
        </button>
        <Link href="/" className="button-secondary">
          Ir al inicio
        </Link>
      </div>
    </PageFrame>
  );
}
