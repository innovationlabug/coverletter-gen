import type { Metadata } from "next";
import { headers } from "next/headers";
import { Lab } from "@/components/Lab";
import { BRAND } from "@/lib/brand";

/**
 * Las etiquetas Open Graph necesitan URLs absolutas. El dominio sale de la petición
 * (Cloud Run, dominio propio o localhost) en lugar de quedar fijo en el código.
 */
export async function generateMetadata(): Promise<Metadata> {
  const h = await headers();
  const rawHost = (h.get("x-forwarded-host") ?? h.get("host") ?? "").split(",")[0].trim();
  const host = /^[a-z0-9.-]+(:\d+)?$/i.test(rawHost) ? rawHost : "localhost:3000";
  const rawProto = (h.get("x-forwarded-proto") ?? "").split(",")[0].trim();
  const proto = rawProto === "http" || rawProto === "https" ? rawProto : host.startsWith("localhost") ? "http" : "https";
  const title = `${BRAND.name} · ${BRAND.tagline}`;
  return {
    metadataBase: new URL(`${proto}://${host}`),
    alternates: { canonical: "/" },
    openGraph: {
      type: "website",
      locale: "es_GT",
      siteName: BRAND.name,
      url: "/",
      title,
      description: BRAND.description,
      images: [BRAND.ogImage],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description: BRAND.description,
      images: [BRAND.ogImage.url],
    },
  };
}

export default function Page() {
  return <Lab />;
}
