import type { Metadata } from "next";
import Link from "next/link";
import { PageFrame } from "@/components/Brand";

export const metadata: Metadata = { title: "Página no encontrada" };

export default function NotFound() {
  return (
    <PageFrame>
      <h1 className="page-title">Esta página no existe.</h1>
      <p className="page-lead">Puede que el enlace esté incompleto o que la página se haya movido.</p>
      <Link href="/" className="button-primary">
        Ir al inicio
      </Link>
    </PageFrame>
  );
}
