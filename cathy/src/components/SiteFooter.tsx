"use client";

import { useId, useRef, useState } from "react";

export function SiteFooter() {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const panelRef = useRef<HTMLDivElement>(null);

  function toggle() {
    const next = !open;
    setOpen(next);
    if (next) requestAnimationFrame(() => panelRef.current?.scrollIntoView({ block: "nearest", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" }));
  }

  return (
    <footer className="site-footer">
      <div id={panelId} ref={panelRef} className="privacy" hidden={!open} data-testid="privacy">
        <h2 className="privacy-title">Cómo cuidamos tus datos</h2>
        <p>
          Los números de tu nota se calculan aquí mismo, en tu navegador. Para redactar el consejo de tu nota, tus datos viajan
          cifrados a un servidor privado de Rango y no se comparten con nadie. La carta la escribe un servicio externo que solo
          recibe lo necesario: el puesto, la empresa y tus logros. Nunca recibe tu salario ni el nombre de tu empleador actual. No
          guardamos lo que escribes ni te pedimos crear una cuenta; al cerrar la página, todo se borra.
        </p>
      </div>
      <div className="footer-row">
        <p>Tu salario nunca aparece en tu carta.</p>
        <button type="button" className="link" aria-expanded={open} aria-controls={panelId} onClick={toggle} data-testid="privacy-toggle">
          Cómo cuidamos tus datos
        </button>
      </div>
    </footer>
  );
}
