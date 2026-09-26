"use client";

import { Fragment, useState } from "react";
import { FX_GTQ_PER_USD } from "@/config/constants";
import type { LetterOutput } from "@/lib/generate";
import { formatMoney, fromGTQ, type BandId, type NegotiationNote } from "@/lib/negotiation";
import type { Profile } from "@/lib/types";
import { LockIcon } from "./ProfileForm";

// ---------------------------------------------------------------------------
// Loading
// ---------------------------------------------------------------------------

export function Working({ message }: { message: string }) {
  return (
    <section className="working" aria-busy="true" data-testid="working">
      <p className="working-text" role="status">
        {message}
      </p>
      <div className="working-bar" aria-hidden="true">
        <span />
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// The letter (goes to the company)
// ---------------------------------------------------------------------------

export function LetterSheet({ letter }: { letter: LetterOutput }) {
  const [text, setText] = useState(letter.text);
  const [editing, setEditing] = useState(false);
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard blocked: the user can still select the text */
    }
  };

  return (
    <section className="letter" aria-labelledby="letter-title" data-testid="letter" data-source={letter.source}>
      <header className="section-head">
        <h2 id="letter-title">Tu carta</h2>
        <div className="actions">
          <button type="button" className="quiet" aria-pressed={editing} onClick={() => setEditing((v) => !v)}>
            {editing ? "Listo" : "Editar"}
          </button>
          <button type="button" className="secondary" onClick={copy}>
            {copied ? "Copiada" : "Copiar"}
          </button>
        </div>
      </header>
      <span className="visually-hidden" role="status">
        {copied ? "Carta copiada al portapapeles" : ""}
      </span>

      {editing ? (
        <textarea
          className="letter-edit"
          aria-label="Texto de la carta"
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={Math.max(14, text.split("\n").length + 4)}
        />
      ) : (
        <div className="letter-body">
          {text.split(/\n{2,}/).map((p, i) => (
            <p key={i}>
              {p.split("\n").map((line, j, arr) => (
                <span key={j}>
                  {line}
                  {j < arr.length - 1 && <br />}
                </span>
              ))}
            </p>
          ))}
        </div>
      )}

      {letter.usedFacts.length > 0 && (
        <p className="sources">
          Fuentes:{" "}
          {letter.usedFacts.map((f, i) => (
            <Fragment key={f.id}>
              {i > 0 && " · "}
              <a href={f.url} target="_blank" rel="noreferrer noopener" title={safeHost(f.url)}>
                {f.title || safeHost(f.url)}
              </a>
            </Fragment>
          ))}
        </p>
      )}
    </section>
  );
}

function safeHost(url: string) {
  try {
    return new URL(url).host.replace(/^www\./, "");
  } catch {
    return "";
  }
}

// ---------------------------------------------------------------------------
// The private note (the carbon copy that stays with you)
// ---------------------------------------------------------------------------

const VERDICT: Record<BandId, { label: string; tone: "good" | "warn" | "risk" }> = {
  below: { label: "Por debajo", tone: "warn" },
  conservative: { label: "Conservadora", tone: "warn" },
  realistic: { label: "Realista", tone: "good" },
  ambitious: { label: "Ambiciosa", tone: "warn" },
  out_of_range: { label: "Fuera de rango", tone: "risk" },
};

/** Keep "30 %" together when a line wraps. */
const nb = (t: string) => t.replace(/(\d) %/g, "$1\u00a0%");

function gapSentence(gapPct: number): string {
  const gap = Math.round(gapPct);
  if (gap > 0) return `pides ${gap}\u00a0% más`;
  if (gap < 0) return `pides ${-gap}\u00a0% menos`;
  return "pides lo mismo que hoy";
}

function MarketBar({ note }: { note: NegotiationNote }) {
  const m = note.market;
  if (!m) return null;
  const cur = note.suggestedRange.currency;
  const lo = Math.min(m.minGTQ, note.desiredMonthlyGTQ) * 0.92;
  const hi = Math.max(m.maxGTQ, note.desiredMonthlyGTQ) * 1.06;
  const pct = (v: number) => ((v - lo) / (hi - lo)) * 100;
  const f = (gtq: number) => formatMoney(fromGTQ(gtq, cur), cur);
  const you = pct(note.desiredMonthlyGTQ);
  const source = [
    `Según ${m.source}`,
    m.salaryCount ? `${m.salaryCount} salarios` : null,
    m.salaryCount !== null && m.salaryCount < 10 ? "muestra pequeña" : null,
    m.fromCache ? "datos guardados" : null,
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <figure className="market">
      <div
        className="market-track"
        role="img"
        aria-label={`Mercado: de ${f(m.minGTQ)} a ${f(m.maxGTQ)}, mediana ${f(m.medianGTQ)}. Tú pides ${f(note.desiredMonthlyGTQ)}.`}
      >
        <div className="market-range" style={{ left: `${pct(m.minGTQ)}%`, width: `${pct(m.maxGTQ) - pct(m.minGTQ)}%` }} />
        <div className="market-median" style={{ left: `${pct(m.medianGTQ)}%` }} />
        <div className={`market-you${you > 70 ? " is-right" : you < 30 ? " is-left" : ""}`} style={{ left: `${you}%` }}>
          <span>Tú {f(note.desiredMonthlyGTQ)}</span>
        </div>
      </div>
      <div className="market-legend" aria-hidden="true">
        <span>{f(m.minGTQ)}</span>
        <span>Mediana {f(m.medianGTQ)}</span>
        <span>{f(m.maxGTQ)}</span>
      </div>
      <figcaption className="market-source">{source}</figcaption>
    </figure>
  );
}

export function PrivateNote({ note, profile, offline }: { note: NegotiationNote; profile: Profile; offline: boolean }) {
  const verdict = VERDICT[note.band.id];
  const r = note.suggestedRange;
  const items = (id: string) => (note.sections.find((s) => s.id === id)?.items ?? []).map(nb);
  const when = items("when");
  const tips = when.slice(0, 2);
  const moreTips = when.slice(2);
  const offer = items("offer");
  const never = items("never");
  const usesUSD = profile.currentCurrency === "USD" || profile.desiredCurrency === "USD" || note.market?.originalCurrency === "USD";

  return (
    <section className="note" aria-labelledby="note-title" data-testid="note" data-band={note.band.id}>
      <header className="section-head">
        <h2 id="note-title">Tu nota privada</h2>
        <p className="note-tag">
          <LockIcon /> Solo para ti
        </p>
      </header>

      <p className="verdict">
        <span className={`verdict-word tone-${verdict.tone}`}>{verdict.label}</span>
        <span className="verdict-gap"> · {gapSentence(note.gapPct)}</span>
      </p>

      {note.market && <MarketBar note={note} />}

      <p className="ask">
        <span className="ask-label">Si te piden un número</span>
        <span className="ask-range">
          {formatMoney(r.min, r.currency)}–{formatMoney(r.max, r.currency)} <span>al mes</span>
        </span>
      </p>

      <ul className="tips">
        {tips.map((t, i) => (
          <li key={i}>{t}</li>
        ))}
      </ul>

      <details className="more note-more">
        <summary>Ver más</summary>
        <div className="note-more-body">
          <p>
            De {formatMoney(profile.currentSalary, profile.currentCurrency)} a{" "}
            {formatMoney(profile.desiredSalary, profile.desiredCurrency)} al mes. {nb(note.band.summary)}
          </p>
          {!note.market && (
            <p>
              {offline
                ? "Sin conexión no pudimos consultar salarios del mercado; comparamos solo con tu salario actual."
                : "No encontramos datos de mercado para este puesto; comparamos solo con tu salario actual."}
            </p>
          )}
          {moreTips.length > 0 && (
            <ul>
              {moreTips.map((t, i) => (
                <li key={i}>{t}</li>
              ))}
            </ul>
          )}
          {profile.jobOffer.trim() && (
            <>
              <h3>Lo que dice la oferta</h3>
              <ul>
                {offer.map((t, i) => (
                  <li key={i}>{t}</li>
                ))}
              </ul>
            </>
          )}
          <h3>Lo que nunca va por escrito</h3>
          <ul>
            {never.map((t, i) => (
              <li key={i}>{t}</li>
            ))}
          </ul>
          {usesUSD && <p className="fine">Tipo de cambio fijo: Q{FX_GTQ_PER_USD} por dólar.</p>}
        </div>
      </details>
    </section>
  );
}
