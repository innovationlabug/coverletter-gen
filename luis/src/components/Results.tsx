"use client";

import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { FX_GTQ_PER_USD } from "@/config/constants";
import type { LetterOutput } from "@/lib/generate";
import { formatMoney, fromGTQ, type BandId, type NegotiationNote } from "@/lib/negotiation";
import type { Profile } from "@/lib/types";
import { LockIcon } from "./Brand";

// ---------------------------------------------------------------------------
// Loading: a quiet sketch of the letter while the real one is written
// ---------------------------------------------------------------------------

export function Working({ step, company }: { step: 1 | 2; company: string }) {
  const message = step === 1 ? `Investigando ${company}…` : "Escribiendo tu carta…";
  return (
    <section className="working" aria-busy="true" aria-labelledby="working-text" data-testid="working">
      <div className="working-head">
        <p className="working-text" id="working-text" role="status">
          {message}
        </p>
        <p className="working-step" aria-hidden="true">
          Paso {step} de 2
        </p>
      </div>
      <div className="working-progress" aria-hidden="true">
        <span className={step === 2 ? "is-step-2" : undefined} />
      </div>
      <div className="sheet sheet-skeleton" aria-hidden="true">
        <p className="sk-head">Tu carta</p>
        {[62, 100, 96, 88, 0, 100, 92, 97, 70, 0, 40, 30].map((w, i) =>
          w === 0 ? <div key={i} className="sk-gap" /> : <div key={i} className="sk-line" style={{ width: `${w}%` }} />,
        )}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// The letter (goes to the company)
// ---------------------------------------------------------------------------

function slug(s: string) {
  return (
    s
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 40) || "empresa"
  );
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Older browsers or a denied permission: fall back to a hidden selection.
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try {
      ok = document.execCommand("copy");
    } catch {
      ok = false;
    }
    ta.remove();
    return ok;
  }
}

function Icon({ name }: { name: "copy" | "check" | "download" | "edit" }) {
  const paths: Record<typeof name, ReactNode> = {
    copy: (
      <>
        <rect x="5.5" y="5.5" width="8" height="8" rx="1.6" />
        <path d="M10.5 5.5V4a1.5 1.5 0 0 0-1.5-1.5H4A1.5 1.5 0 0 0 2.5 4v5A1.5 1.5 0 0 0 4 10.5h1.5" />
      </>
    ),
    check: <path d="m3 8.5 3.2 3L13 4.5" />,
    download: (
      <>
        <path d="M8 2.5v8M4.5 7 8 10.5 11.5 7" />
        <path d="M3 13.5h10" />
      </>
    ),
    edit: <path d="M10.2 3.3a1.6 1.6 0 0 1 2.3 2.3L5.8 12.3l-3 .7.7-3 6.7-6.7Z" />,
  };
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {paths[name]}
    </svg>
  );
}

/**
 * Lives in <body> (portal) so no animated ancestor becomes its containing
 * block. The live region is always mounted; only its text changes.
 */
function Toast({ toast }: { toast: { id: number; text: string } | null }) {
  // Results only render in the browser (after a submit), never on the server.
  if (typeof document === "undefined") return null;
  return createPortal(
    <div className="toast-region" role="status" aria-live="polite" data-testid="toast">
      {toast && (
        <p key={toast.id} className="toast">
          {toast.text.startsWith("Copiada") && <Icon name="check" />}
          {toast.text}
        </p>
      )}
    </div>,
    document.body,
  );
}

export function LetterSheet({ letter, company }: { letter: LetterOutput; company: string }) {
  const [text, setText] = useState(letter.text);
  const [editing, setEditing] = useState(false);
  const [toast, setToast] = useState<{ id: number; text: string } | null>(null);
  const editor = useRef<HTMLTextAreaElement>(null);
  const editButton = useRef<HTMLButtonElement>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => clearTimeout(toastTimer.current), []);

  const say = (t: string) => {
    clearTimeout(toastTimer.current);
    setToast({ id: Date.now(), text: t });
    toastTimer.current = setTimeout(() => setToast(null), 2600);
  };

  const copy = async () => {
    if (await copyText(text)) say("Copiada. Ya puedes pegarla en tu correo.");
    else say("No pudimos copiarla. Selecciona el texto y cópialo.");
  };

  const download = () => {
    const blob = new Blob([text.replace(/\n/g, "\r\n")], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `carta-${slug(company)}.txt`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const toggleEdit = () => {
    const next = !editing;
    setEditing(next);
    requestAnimationFrame(() => {
      if (next) {
        const el = editor.current;
        el?.focus();
        el?.setSelectionRange(0, 0);
        el?.scrollTo({ top: 0 });
      } else editButton.current?.focus();
    });
  };

  const copied = toast?.text.startsWith("Copiada");

  return (
    <section className="letter sheet" aria-labelledby="letter-title" data-testid="letter" data-source={letter.source}>
      <header className="section-head">
        <h2 id="letter-title">Tu carta</h2>
        <div className="actions" role="group" aria-label="Acciones de la carta">
          <button ref={editButton} type="button" className="tool" aria-pressed={editing} onClick={toggleEdit}>
            <Icon name={editing ? "check" : "edit"} />
            {editing ? "Listo" : "Editar"}
          </button>
          <button type="button" className="tool" onClick={download}>
            <Icon name="download" />
            Descargar
          </button>
          <button type="button" className="tool tool-strong" onClick={copy}>
            <Icon name={copied ? "check" : "copy"} />
            Copiar
          </button>
        </div>
      </header>

      {editing ? (
        <textarea
          ref={editor}
          className="letter-edit"
          aria-label="Texto de la carta"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape" || (e.key === "Enter" && (e.metaKey || e.ctrlKey))) {
              e.preventDefault();
              toggleEdit();
            }
          }}
          rows={Math.max(14, text.split("\n").length + 3)}
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
          <span className="sources-label">Fuentes</span>
          {letter.usedFacts.map((f, i) => (
            <Fragment key={f.id}>
              {i > 0 && <span aria-hidden="true"> · </span>}
              <a href={f.url} target="_blank" rel="noreferrer noopener" title={safeHost(f.url)}>
                {f.title || safeHost(f.url)}
              </a>
            </Fragment>
          ))}
        </p>
      )}

      <Toast toast={toast} />
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
    <section className="note sheet" aria-labelledby="note-title" data-testid="note" data-band={note.band.id}>
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
