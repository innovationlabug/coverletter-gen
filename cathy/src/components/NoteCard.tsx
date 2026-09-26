"use client";

import type { NegotiationFacts } from "@/lib/facts";
import type { HeuristicNote } from "@/lib/note";
import { formatMoney } from "@/lib/heuristics/currency";

/** El texto que redacta el modelo privado: listo o no disponible. */
export type DraftView = { kind: "ready"; text: string; flagged: string[]; offTopic: boolean } | { kind: "missing"; offline: boolean };

function escapeRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function Highlighted({ text, flagged }: { text: string; flagged: string[] }) {
  if (!flagged.length) return <>{text}</>;
  const re = new RegExp(`(${flagged.map(escapeRe).join("|")})`, "g");
  return (
    <>
      {text.split(re).map((part, i) =>
        flagged.includes(part) ? <mark key={i}>{part}</mark> : <span key={i}>{part}</span>,
      )}
    </>
  );
}

function quoteList(items: string[]): string {
  const q = items.map((s) => `“${s}”`);
  return q.length <= 1 ? q.join("") : `${q.slice(0, -1).join(", ")} y ${q[q.length - 1]}`;
}

export function NoteCard({ note, facts, draft }: { note: HeuristicNote; facts: NegotiationFacts; draft: DraftView }) {
  const sign = facts.deltaGTQ >= 0 ? "+" : "−";
  const figures = [
    { label: "Hoy", value: formatMoney(facts.current.amount, facts.current.currency) },
    { label: "Pides", value: formatMoney(facts.desired.amount, facts.desired.currency) },
    { label: "Diferencia", value: `${sign}${formatMoney(Math.abs(facts.deltaGTQ), "GTQ")}` },
  ];
  const mixedCurrency = facts.current.currency !== facts.desired.currency;
  const flagged = draft.kind === "ready" ? [...new Set(draft.flagged)] : [];

  return (
    <section className="note" data-testid="note" aria-labelledby="note-title">
      <h2 id="note-title">Tu nota privada</h2>

      <p className="verdict" data-testid="note-headline">
        {note.headline}
      </p>
      <p className="verdict-sub">{note.advice}</p>

      <dl className="figures" aria-label="Montos mensuales">
        {figures.map((f) => (
          <div key={f.label}>
            <dt>{f.label}</dt>
            <dd>{f.value}</dd>
          </div>
        ))}
      </dl>

      <ul className="tips">
        <li data-testid="timing">Cuándo decirlo: {note.timing.moment}</li>
        {note.rangeNote && <li>{note.rangeNote}</li>}
      </ul>

      <details className="more" data-testid="note-more">
        <summary>Ver más</summary>
        <div className="more-body">
          <p className="quiet">{note.timing.why}</p>
          {mixedCurrency && <p className="quiet">Para comparar usamos Q{facts.gtqPerUsd} por US$1.</p>}

          <div className="advice" data-testid="draft">
            <h3>Cómo plantearlo</h3>
            {draft.kind === "ready" && (
              <>
                {flagged.length > 0 && (
                  <p className="check" data-testid="flagged">
                    Ojo: menciona {quoteList(flagged)}, {flagged.length > 1 ? "cifras que no salen" : "una cifra que no sale"} de tus datos. Guíate por los números de arriba.
                  </p>
                )}
                {draft.offTopic && (
                  <p className="check" data-testid="off-topic">
                    Este texto podría no responder a tu caso. Guíate por los números de arriba.
                  </p>
                )}
                {draft.text
                  .split(/\n\s*\n/)
                  .filter((p) => p.trim())
                  .map((p, i) => (
                    <p key={i} className="advice-text">
                      <Highlighted text={p.trim()} flagged={flagged} />
                    </p>
                  ))}
              </>
            )}
            {draft.kind === "missing" && (
              <p className="quiet" data-testid="draft-fallback">
                {draft.offline
                  ? "Sin conexión solo tienes los números. Vuelve a generar con internet para recibir este consejo."
                  : "Esta vez no pudimos preparar este consejo. Los números de arriba siguen siendo válidos."}
              </p>
            )}
          </div>
        </div>
      </details>
    </section>
  );
}
