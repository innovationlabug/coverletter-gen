"use client";

import type { GenerateResult } from "@/lib/orchestrator";
import { GAP_BANDS } from "@/lib/heuristics/gap";

/** Posición del pin en el medidor de bandas (escala por tramos, no lineal). */
function meterPosition(pct: number): number {
  const segs: Array<[number, number, number, number]> = [
    [-20, 0, 0, 1],
    [0, 10, 1, 2],
    [10, 20, 2, 3],
    [20, 35, 3, 4.5],
    [35, 60, 4.5, 6],
  ];
  const p = Math.max(-20, Math.min(60, pct));
  const [a, b, x0, x1] = segs.find(([a, b]) => p >= a && p <= b) ?? segs[4];
  return ((x0 + ((p - a) / (b - a)) * (x1 - x0)) / 6) * 100;
}

function escapeRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function Highlighted({ text, flagged }: { text: string; flagged: string[] }) {
  if (!flagged.length) return <>{text}</>;
  const re = new RegExp(`(${flagged.map(escapeRe).join("|")})`, "g");
  return (
    <>
      {text.split(re).map((part, i) =>
        flagged.includes(part) ? (
          <mark key={i} title="Cifra que la app no calculó: no la uses sin verificar">
            {part}
          </mark>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
  );
}

export function NoteCard({ result }: { result: GenerateResult }) {
  const { note, facts, draft, draftError } = result;
  const flagged = draft?.consistency.flagged ?? [];
  return (
    <section className="sheet" data-testid="note">
      <div className="sheet-head">
        <div>
          <div className="eyebrow">Nota privada de negociación</div>
          <h2>Solo para ti</h2>
        </div>
        <span className="stamp">no sale del perímetro</span>
      </div>

      <p className="headline" data-testid="note-headline">
        {note.headline}
      </p>

      <div className="figures">
        {note.figures.map((f) => (
          <div className="figure" key={f.label}>
            <div className="k">{f.label}</div>
            <div className="v">{f.value}</div>
          </div>
        ))}
      </div>

      <div className="meter" aria-label={`Banda: ${note.bandLabel}`}>
        <div className="meter-track">
          {GAP_BANDS.map((b) => (
            <div key={b.band} className={b.band === facts.band ? "on" : ""}>
              {b.label.replace("Pides menos que hoy", "recorte").toLowerCase()}
            </div>
          ))}
          <span className="meter-pin" style={{ left: `calc(${meterPosition(facts.gapPct)}% - 1px)` }} />
        </div>
        <div className="meter-scale">
          <span>&lt;0 %</span>
          <span>0–10</span>
          <span>10–20</span>
          <span>20–35</span>
          <span>35 %+</span>
        </div>
      </div>

      {note.rangeNote && (
        <div className="callout">
          <div className="eyebrow">Rango publicado · regex sobre la oferta</div>
          <p>{note.rangeNote}</p>
        </div>
      )}
      <div className="callout">
        <div className="eyebrow">Lectura de la banda</div>
        <p>{note.advice}</p>
      </div>
      <div className="callout" data-testid="timing">
        <div className="eyebrow">Cuándo mencionarlo · regla “{facts.timing.id}”</div>
        <p>
          <strong>{note.timing.moment}</strong> {note.timing.why}
        </p>
      </div>

      <div className="draft" data-testid="draft">
        <div className="sheet-head" style={{ marginBottom: 8 }}>
          <span className="eyebrow" style={{ color: "var(--t1)" }}>
            Borrador del modelo local · T1
          </span>
          {draft && (
            <span style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {draft.consistency.ok ? (
                <span className="badge ok">✓ cifras consistentes ({draft.consistency.checked})</span>
              ) : (
                <span className="badge warn" data-testid="flagged">
                  ⚠ {flagged.length} cifra{flagged.length > 1 ? "s" : ""} no calculada{flagged.length > 1 ? "s" : ""} por la app
                </span>
              )}
              {!draft.topic.onTopic && <span className="badge warn">⚠ posible respuesta fuera de tema</span>}
            </span>
          )}
        </div>
        {draft ? (
          <>
            <div className="draft-text">
              <Highlighted text={draft.text} flagged={flagged.map((f) => f.raw)} />
            </div>
            <p className="note-small">
              El modelo redacta; los números de arriba vienen de heurísticas. Lo marcado en rojo no coincide con ningún dato calculado.
            </p>
          </>
        ) : (
          <p className="note-small" data-testid="draft-fallback">
            {draftError ?? "Sin borrador."} Las cifras, la banda y la regla de momento de arriba siguen siendo válidas.
          </p>
        )}
      </div>
    </section>
  );
}
