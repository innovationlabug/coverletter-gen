"use client";

import type { NegotiationFacts } from "@/lib/facts";
import type { HeuristicNote } from "@/lib/note";
import { GAP_BANDS } from "@/lib/heuristics/gap";
import { formatMoney } from "@/lib/heuristics/currency";

/** El texto redactado de la nota: en camino, listo o no disponible. */
export type DraftView =
  | { kind: "pending"; live: string }
  | { kind: "ready"; text: string; flagged: string[]; offTopic: boolean }
  | { kind: "missing"; offline: boolean };

const BAND_NAMES: Record<string, string> = {
  recorte: "Menos que hoy",
  conservador: "Conservador",
  razonable: "Razonable",
  ambicioso: "Ambicioso",
  agresivo: "Agresivo",
};

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
    { label: "Hoy ganas", value: formatMoney(facts.current.amount, facts.current.currency) },
    { label: "Quieres pedir", value: formatMoney(facts.desired.amount, facts.desired.currency) },
    { label: "Diferencia", value: `${sign}${formatMoney(Math.abs(facts.deltaGTQ), "GTQ")}` },
  ];
  const mixedCurrency = facts.current.currency !== facts.desired.currency;
  const flagged = draft.kind === "ready" ? [...new Set(draft.flagged)] : [];

  return (
    <section className="note" data-testid="note" aria-labelledby="note-title">
      <div className="card-head">
        <h2 id="note-title">Tu nota privada</h2>
      </div>

      <p className="verdict" data-testid="note-headline">
        {note.headline}
      </p>

      <div className="bands" role="img" aria-label={`Tu expectativa es: ${note.bandLabel}`}>
        {GAP_BANDS.map((b) => (
          <div key={b.band} className={b.band === facts.band ? "band on" : "band"}>
            <span className="bar" />
            <span className="band-name">{BAND_NAMES[b.band]}</span>
          </div>
        ))}
      </div>

      <dl className="figures">
        {figures.map((f) => (
          <div key={f.label}>
            <dt>{f.label}</dt>
            <dd>
              {f.value}
              <small>al mes</small>
            </dd>
          </div>
        ))}
      </dl>
      {mixedCurrency && <p className="fineprint">Para comparar usamos Q{facts.gtqPerUsd} por US$1.</p>}

      <ul className="points">
        <li>{note.advice}</li>
        {note.rangeNote && <li>{note.rangeNote}</li>}
        <li data-testid="timing">
          <strong>Cuándo decirlo:</strong> {note.timing.moment} {note.timing.why}
        </li>
      </ul>

      <div className="advice" data-testid="draft" aria-live="polite">
        <h3>Cómo plantearlo</h3>
        {draft.kind === "pending" &&
          (draft.live ? (
            <p className="advice-text streaming">{draft.live}</p>
          ) : (
            <div className="lines light" aria-hidden>
              <span />
              <span style={{ width: "86%" }} />
              <span style={{ width: "58%" }} />
            </div>
          ))}
        {draft.kind === "ready" && (
          <>
            {flagged.length > 0 && (
              <p className="check" data-testid="flagged">
                Ojo: este texto menciona {quoteList(flagged)}, {flagged.length > 1 ? "cifras que no salen" : "una cifra que no sale"} de tus datos. Guíate por los números de arriba.
              </p>
            )}
            {draft.offTopic && (
              <p className="check" data-testid="off-topic">
                Este texto podría no responder bien a tu caso. Guíate por los puntos de arriba.
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
          <p className="advice-text muted" data-testid="draft-fallback">
            {draft.offline
              ? "Sin conexión solo podemos darte los números y los puntos de arriba. Vuelve a generar cuando tengas internet para recibir el consejo completo."
              : "Esta vez no pudimos preparar este texto. Los números y los puntos de arriba siguen siendo válidos."}
          </p>
        )}
      </div>
    </section>
  );
}
