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

/**
 * La idea de la marca, en pequeño: dónde estás hoy, dónde vas a pedir y, si la oferta lo publica,
 * el rango que ofrecen. Todo en quetzales al mes. Es decorativo: las cifras exactas están al lado.
 */
function RangeBar({ facts }: { facts: NegotiationFacts }) {
  const r = facts.offerRange;
  const lo = r?.minGTQMonthly ?? null;
  const hi = r?.maxGTQMonthly ?? null;
  const values = [facts.currentGTQ, facts.desiredGTQ, lo, hi].filter((v): v is number => v != null && Number.isFinite(v));
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const pad = span * 0.12;
  const pos = (v: number) => `${(((v - (min - pad)) / (span + 2 * pad)) * 100).toFixed(2)}%`;
  const [a, b] = [facts.currentGTQ, facts.desiredGTQ].sort((x, y) => x - y);
  const band = lo != null || hi != null ? { from: lo ?? min - pad, to: hi ?? max + pad } : null;
  return (
    <div className="range-bar" aria-hidden data-testid="range-bar">
      <div className="rb-track">
        {band && <span className="rb-band" style={{ left: pos(band.from), right: `calc(100% - ${pos(band.to)})` }} />}
        <span className="rb-jump" style={{ left: pos(a), right: `calc(100% - ${pos(b)})` }} />
        <span className="rb-dot rb-now" style={{ left: pos(facts.currentGTQ) }} />
        <span className="rb-dot rb-ask" style={{ left: pos(facts.desiredGTQ) }} />
      </div>
      {band && (
        <p className="rb-caption">
          <span className="rb-swatch" />
          Rango de la oferta
        </p>
      )}
    </div>
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
    <section className="note reveal" data-testid="note" aria-labelledby="note-title">
      <div className="note-head">
        <h2 id="note-title">Tu nota privada</h2>
        <span className="private-tag">Solo para ti</span>
      </div>

      <p className="verdict" data-testid="note-headline">
        {note.headline}
      </p>
      <p className="verdict-sub">{note.advice}</p>

      <div className="figures">
        <dl aria-label="Montos mensuales">
          {figures.map((f, i) => (
            <div key={f.label}>
              <dt>
                {i < 2 && <span className={i === 0 ? "key key-now" : "key key-ask"} aria-hidden />}
                {f.label}
              </dt>
              <dd>{f.value}</dd>
            </div>
          ))}
        </dl>
        <RangeBar facts={facts} />
      </div>

      <ul className="tips">
        <li data-testid="timing">
          <strong>Cuándo decirlo:</strong> {note.timing.moment}
        </li>
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
