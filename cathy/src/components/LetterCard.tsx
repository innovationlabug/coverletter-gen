"use client";

import { useState } from "react";
import type { GenerateResult } from "@/lib/orchestrator";

export function LetterCard({ result }: { result: GenerateResult }) {
  const { letter } = result;
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard
      ?.writeText(letter.text)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      })
      .catch(() => {});
  };
  return (
    <section className="letter" data-testid="letter" data-source={letter.source} aria-labelledby="letter-title">
      <div className="card-head">
        <h2 id="letter-title">Tu carta</h2>
        <button type="button" className="secondary" onClick={copy} data-testid="copy-letter">
          {copied ? "Copiada" : "Copiar"}
        </button>
      </div>
      {letter.source === "template" && (
        <p className="letter-note" data-testid="letter-basic">
          Es una versión básica. Revísala y agrégale tu toque antes de enviarla.
        </p>
      )}
      <div className="letter-text" data-testid="letter-text">
        {letter.text}
      </div>
      <span className="sr-only" aria-live="polite">
        {copied ? "Carta copiada al portapapeles" : ""}
      </span>
    </section>
  );
}

/** Hoja en blanco mientras se escribe la carta. */
export function LetterPending() {
  return (
    <section className="letter pending" aria-label="Tu carta, en preparación" data-testid="letter-pending">
      <div className="card-head">
        <h2>Tu carta</h2>
      </div>
      <div className="lines" aria-hidden>
        <span style={{ width: "42%" }} />
        <span />
        <span />
        <span style={{ width: "88%" }} />
        <span />
        <span style={{ width: "64%" }} />
        <span style={{ width: "30%" }} />
      </div>
    </section>
  );
}
