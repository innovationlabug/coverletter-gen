"use client";

import { useState } from "react";
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
    <section className="sheet sheet-working" aria-busy="true" data-testid="working">
      <p className="working-text" role="status">
        {message}
      </p>
      <div className="working-bar" aria-hidden="true">
        <span />
      </div>
      <div className="ghost-lines" aria-hidden="true">
        <span style={{ width: "46%" }} />
        <span />
        <span />
        <span style={{ width: "82%" }} />
        <span />
        <span style={{ width: "64%" }} />
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
    <section className="sheet letter" aria-labelledby="letter-title" data-testid="letter" data-source={letter.source}>
      <header className="sheet-head">
        <h2 id="letter-title">Tu carta</h2>
        <div className="sheet-actions">
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
        <footer className="sources">
          <h3>Fuentes sobre la empresa</h3>
          <ol>
            {letter.usedFacts.map((f) => (
              <li key={f.id}>
                <a href={f.url} target="_blank" rel="noreferrer noopener">
                  {f.title || safeHost(f.url)}
                </a>{" "}
                <span className="source-host">{safeHost(f.url)}</span>
              </li>
            ))}
          </ol>
        </footer>
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
  below: { label: "Por debajo de lo que ganas", tone: "warn" },
  conservative: { label: "Conservadora", tone: "warn" },
  realistic: { label: "Realista", tone: "good" },
  ambitious: { label: "Ambiciosa", tone: "warn" },
  out_of_range: { label: "Fuera de rango", tone: "risk" },
};

function MarketBar({ note, profile }: { note: NegotiationNote; profile: Profile }) {
  const m = note.market;
  if (!m) return null;
  const cur = note.suggestedRange.currency;
  const lo = Math.min(m.minGTQ, note.desiredMonthlyGTQ) * 0.92;
  const hi = Math.max(m.maxGTQ, note.desiredMonthlyGTQ) * 1.06;
  const pct = (v: number) => ((v - lo) / (hi - lo)) * 100;
  const f = (gtq: number) => formatMoney(fromGTQ(gtq, cur), cur);
  const you = pct(note.desiredMonthlyGTQ);
  return (
    <figure className="market">
      <figcaption className="market-title">Tu número frente al mercado</figcaption>
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
      <p className="market-source">
        Para {profile.desiredRole} en {profile.location}, según {m.source}
        {m.salaryCount ? ` (${m.salaryCount} salarios reportados)` : ""}.
        {m.fromCache ? " Datos guardados de tu consulta anterior." : ""}
        {m.salaryCount !== null && m.salaryCount < 10 ? " Muestra pequeña: tómalo como referencia." : ""}
      </p>
    </figure>
  );
}

export function PrivateNote({ note, profile, offline }: { note: NegotiationNote; profile: Profile; offline: boolean }) {
  const verdict = VERDICT[note.band.id];
  const gap = Math.round(note.gapPct);
  const r = note.suggestedRange;
  const when = note.sections.find((s) => s.id === "when")?.items ?? [];
  const bullets = when.filter((t) => !t.startsWith("Si tienes que dar un número")).slice(0, 4);
  const offer = note.sections.find((s) => s.id === "offer")?.items ?? [];
  const never = note.sections.find((s) => s.id === "never")?.items ?? [];
  const usesUSD = profile.currentCurrency === "USD" || profile.desiredCurrency === "USD" || note.market?.originalCurrency === "USD";

  return (
    <section className="note" aria-labelledby="note-title" data-testid="note" data-band={note.band.id}>
      <header className="note-head">
        <h2 id="note-title">Tu nota privada</h2>
        <p className="note-tag">
          <LockIcon /> Solo para ti
        </p>
      </header>

      <div className="verdict">
        <p className={`verdict-label tone-${verdict.tone}`}>{verdict.label}</p>
        <p className="verdict-gap">
          Pides {gap >= 0 ? "+" : ""}
          {gap} % sobre tu salario actual: de {formatMoney(profile.currentSalary, profile.currentCurrency)} a{" "}
          {formatMoney(profile.desiredSalary, profile.desiredCurrency)} al mes.
        </p>
        <p className="verdict-summary">{note.band.summary}</p>
      </div>

      {note.market ? (
        <MarketBar note={note} profile={profile} />
      ) : (
        <p className="market-missing">
          {offline
            ? "Sin conexión no pudimos consultar salarios del mercado, así que comparamos solo con tu salario actual."
            : "No encontramos datos de mercado para este puesto, así que comparamos solo con tu salario actual."}
        </p>
      )}

      <div className="ask">
        <p className="ask-label">Si te piden un número</p>
        <p className="ask-range">
          {formatMoney(r.min, r.currency)} – {formatMoney(r.max, r.currency)} <span>al mes</span>
        </p>
      </div>

      <h3 className="note-subtitle">Cuándo y cómo mencionarlo</h3>
      <ul className="note-list">
        {bullets.map((t, i) => (
          <li key={i}>{t}</li>
        ))}
      </ul>

      <details className="note-more">
        <summary>Más detalles</summary>
        {profile.jobOffer.trim() && (
          <>
            <h4>Lo que dice la oferta</h4>
            <ul>
              {offer.map((t, i) => (
                <li key={i}>{t}</li>
              ))}
            </ul>
          </>
        )}
        <h4>Lo que nunca va por escrito</h4>
        <ul>
          {never.map((t, i) => (
            <li key={i}>{t}</li>
          ))}
        </ul>
        {usesUSD && (
          <p className="note-fine">Convertimos dólares a quetzales con un tipo de cambio fijo de {FX_GTQ_PER_USD} por dólar.</p>
        )}
      </details>
    </section>
  );
}
