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
      <div className="section-head">
        <h2 id="letter-title">Tu carta</h2>
        <button type="button" className="secondary" onClick={copy} data-testid="copy-letter">
          {copied ? "Copiada" : "Copiar"}
        </button>
      </div>
      {letter.source === "template" && (
        <p className="quiet" data-testid="letter-basic">
          Versión básica: revísala antes de enviarla.
        </p>
      )}
      <div className="letter-text" data-testid="letter-text">
        {letter.text}
      </div>
      <span className="sr-only" aria-live="polite">
        {copied ? "Carta copiada" : ""}
      </span>
    </section>
  );
}
