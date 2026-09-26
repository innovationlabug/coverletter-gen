import Link from "next/link";

/** Marca de Rango: un rango [ ] con dos puntos dentro — lo que ganas hoy y lo que vas a pedir. */
export function LogoMark({ size = 28 }: { size?: number }) {
  return (
    <svg className="logo-mark" width={size} height={size} viewBox="0 0 64 64" aria-hidden focusable="false">
      <rect width="64" height="64" rx="15" fill="var(--brand)" />
      <path d="M20 21h-3v22h3M44 21h3v22h-3" fill="none" stroke="#fff" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="26" cy="32" r="2.6" fill="#fff" fillOpacity=".45" />
      <circle cx="36" cy="32" r="7" fill="var(--gold)" />
    </svg>
  );
}

export function SiteHeader() {
  return (
    <header className="site-header">
      <Link href="/" className="brand" aria-label="Rango, inicio">
        <LogoMark />
        <span className="brand-name">Rango</span>
      </Link>
    </header>
  );
}
