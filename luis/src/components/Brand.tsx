"use client";

import Link from "next/link";
import { useRef, useSyncExternalStore, type ReactNode } from "react";

/**
 * The mark: a letter (paper, with a "c") laid over its carbon copy (blue),
 * on a jade tile. Same geometry as public/icon.svg and the PWA icons
 * (scripts/make-icons.mjs), with fixed brand colors in both themes.
 */
export function LogoMark({ size = 28, className }: { size?: number; className?: string }) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      width={size}
      height={size}
      viewBox="0 0 32 32"
      className={className}
    >
      <rect width="32" height="32" rx="8" fill="#0b6b58" />
      <rect x="11" y="5.5" width="14.5" height="18" rx="2.5" fill="#a9bcf0" />
      <rect x="6.5" y="9" width="14.5" height="18" rx="2.5" fill="#fbfaf6" />
      <path d="M16.3 15.45A3.6 3.6 0 1 0 16.3 20.55" fill="none" stroke="#0b6b58" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  );
}

export function LockIcon({ className = "lock" }: { className?: string }) {
  return (
    <svg aria-hidden="true" focusable="false" width="11" height="12" viewBox="0 0 11 12" className={className}>
      <rect x="1" y="5" width="9" height="6.5" rx="1.5" fill="currentColor" />
      <path d="M3 5V3.6a2.5 2.5 0 0 1 5 0V5" fill="none" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Connectivity (shared by the header pill and the app)
// ---------------------------------------------------------------------------

function subscribeOnline(cb: () => void) {
  window.addEventListener("online", cb);
  window.addEventListener("offline", cb);
  return () => {
    window.removeEventListener("online", cb);
    window.removeEventListener("offline", cb);
  };
}

export function useOnline() {
  return useSyncExternalStore(
    subscribeOnline,
    () => navigator.onLine,
    () => true,
  );
}

// ---------------------------------------------------------------------------
// Header
// ---------------------------------------------------------------------------

/**
 * `onHome` lets the app go back to its form without a reload (the form is kept
 * only in memory, on purpose). Without it the brand is a plain link to "/".
 */
export function SiteHeader({ onHome }: { onHome?: () => void }) {
  const online = useOnline();
  return (
    <header className="appbar">
      <Link
        href="/"
        className="brand"
        onClick={(e) => {
          if (!onHome) return;
          e.preventDefault();
          onHome();
        }}
      >
        <LogoMark className="brand-mark" />
        <span className="brand-name">Carta y copia</span>
      </Link>
      {!online && (
        <p className="offline" role="status" data-testid="net">
          <span className="offline-dot" aria-hidden="true" />
          Sin conexión: igual funciona
        </p>
      )}
    </header>
  );
}

// ---------------------------------------------------------------------------
// Footer + privacy explainer
// ---------------------------------------------------------------------------

export function SiteFooter() {
  const dialog = useRef<HTMLDialogElement>(null);
  return (
    <footer className="sitefoot">
      <p className="sitefoot-line">
        <LockIcon /> Tu salario nunca sale de tu dispositivo.
      </p>
      <button type="button" className="link" onClick={() => dialog.current?.showModal()}>
        Cómo cuidamos tus datos
      </button>
      <PrivacyDialog ref={dialog} />
    </footer>
  );
}

function PrivacyDialog({ ref }: { ref: React.Ref<HTMLDialogElement> }) {
  return (
    <dialog
      ref={ref}
      className="sheet-dialog"
      aria-labelledby="privacy-title"
      onClick={(e) => {
        // Click on the backdrop closes it.
        if (e.target === e.currentTarget) e.currentTarget.close();
      }}
    >
      <div className="sheet-dialog-body">
        <h2 id="privacy-title">Cómo cuidamos tus datos</h2>
        <p>
          Tu salario actual, el que quieres, tu nombre y tu empleador se quedan en tu dispositivo. Ahí mismo se
          calcula tu nota privada.
        </p>
        <p>
          Para escribir la carta y buscar noticias de la empresa solo enviamos el puesto, la empresa, tus años de
          experiencia y tus logros, sin cifras ni datos de contacto.
        </p>
        <p>
          No guardamos lo que escribes: al cerrar la página, desaparece. Si no tienes conexión, igual recibes tu nota
          y una carta base que puedes editar.
        </p>
        <form method="dialog" className="sheet-dialog-actions">
          <button type="submit" className="secondary" autoFocus>
            Entendido
          </button>
        </form>
      </div>
    </dialog>
  );
}

/** Frame for the secondary pages (not found, error). */
export function PageFrame({ children }: { children: ReactNode }) {
  return (
    <div className="app">
      <SiteHeader />
      <main className="page-message">{children}</main>
      <SiteFooter />
    </div>
  );
}
