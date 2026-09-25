"use client";

import { useState } from "react";
import type { GenerateResult } from "@/lib/orchestrator";

export function LetterCard({ result }: { result: GenerateResult }) {
  const { letter } = result;
  const [copied, setCopied] = useState(false);
  return (
    <section className="sheet" data-testid="letter">
      <div className="sheet-head">
        <div>
          <div className="eyebrow">Carta de presentación · lista para enviar con tu CV</div>
          <h2>Carta de interés</h2>
        </div>
        <div className="letter-meta">
          {letter.source === "gemini" ? (
            <span className="tag t2" data-testid="letter-source">
              T2 · {letter.model} · {((letter.latencyMs ?? 0) / 1000).toFixed(1)} s
            </span>
          ) : (
            <span className="tag t0" data-testid="letter-source">
              T0 · plantilla determinista
            </span>
          )}
          <button
            type="button"
            className="btn small"
            onClick={() => {
              navigator.clipboard?.writeText(letter.text).then(() => {
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              });
            }}
          >
            {copied ? "copiada ✓" : "copiar"}
          </button>
        </div>
      </div>
      {letter.error && <p className="note-small">{letter.error}</p>}
      <div className="letter" data-testid="letter-text">
        {letter.text}
      </div>
    </section>
  );
}
