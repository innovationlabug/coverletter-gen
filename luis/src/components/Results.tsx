"use client";

import { useState } from "react";
import type { LetterOutput } from "@/lib/generate";
import { formatMoney, fromGTQ, type NegotiationNote } from "@/lib/negotiation";
import type { ApiStatus, ApiStatusInfo, Destination, OutgoingRecord, Profile } from "@/lib/types";
import { LockIcon } from "./ProfileForm";

// ---------------------------------------------------------------------------
// Status chips
// ---------------------------------------------------------------------------

const STATUS_LABEL: Record<ApiStatus, string> = {
  idle: "en espera",
  loading: "consultando…",
  ok: "ok",
  slow: "lento",
  timeout: "lento, sin respuesta",
  failed: "falló",
  offline: "sin conexión",
  cached: "desde caché",
  blocked: "bloqueado",
};

const API_META: Record<Destination, { name: string; role: string }> = {
  gemini: { name: "Gemini", role: "redacta la carta" },
  tavily: { name: "Tavily", role: "investiga la empresa" },
  jsearch: { name: "JSearch", role: "salarios de mercado" },
};

export function StatusStrip({ statuses }: { statuses: Record<Destination, ApiStatusInfo> }) {
  return (
    <ul className="status-strip" aria-live="polite" aria-label="Estado de las APIs">
      {(["tavily", "jsearch", "gemini"] as const).map((d) => {
        const s = statuses[d];
        return (
          <li key={d} className={`chip chip-${s.status}`} data-api={d} data-status={s.status}>
            <span className="chip-dot" aria-hidden="true" />
            <span className="chip-name">{API_META[d].name}</span>
            <span className="chip-state">{STATUS_LABEL[s.status]}</span>
            <span className="chip-role">{s.detail ?? API_META[d].role}</span>
          </li>
        );
      })}
    </ul>
  );
}

// ---------------------------------------------------------------------------
// Letter (the original — this one leaves)
// ---------------------------------------------------------------------------

export function LetterSheet({ letter }: { letter: LetterOutput }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(letter.text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard blocked */
    }
  };
  return (
    <section className="sheet" aria-labelledby="letter-title" data-testid="letter" data-source={letter.source}>
      <header className="sheet-head">
        <div>
          <h2 id="letter-title">Carta de interés</h2>
          <p className="sheet-sub">
            {letter.source === "gemini"
              ? "Escrita con Gemini a partir de datos limpios. Revísala antes de enviarla."
              : `Plantilla local${letter.fallbackReason ? ` (${letter.fallbackReason})` : ""}. Edítala a tu gusto.`}
          </p>
        </div>
        <button type="button" className="ghost" onClick={copy}>
          {copied ? "Copiada" : "Copiar carta"}
        </button>
      </header>
      <div className="letter-body">
        {letter.text.split(/\n{2,}/).map((p, i) => (
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
      {letter.usedFacts.length > 0 && (
        <footer className="sources">
          <h3>Datos de la empresa citados</h3>
          <ol>
            {letter.usedFacts.map((f) => (
              <li key={f.id}>
                <a href={f.url} target="_blank" rel="noreferrer noopener">
                  {f.title || f.url}
                </a>
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
// Carbon copy (the private note — this one stays)
// ---------------------------------------------------------------------------

const BAND_STOPS = [
  { from: -20, to: 10, label: "conservadora" },
  { from: 10, to: 30, label: "realista" },
  { from: 30, to: 60, label: "ambiciosa" },
  { from: 60, to: 100, label: "fuera de rango" },
];

function GapRuler({ gap }: { gap: number }) {
  const min = -20;
  const max = 100;
  const pct = (v: number) => ((Math.min(max, Math.max(min, v)) - min) / (max - min)) * 100;
  return (
    <figure className="ruler" aria-label={`Aumento pedido: ${Math.round(gap)} %`}>
      <div className="ruler-track">
        {BAND_STOPS.map((b) => (
          <div key={b.label} className="ruler-zone" style={{ left: `${pct(b.from)}%`, width: `${pct(b.to) - pct(b.from)}%` }}>
            <span>{b.label}</span>
          </div>
        ))}
        <div className="ruler-mark" style={{ left: `${pct(gap)}%` }}>
          <span>{`${gap >= 0 ? "+" : ""}${Math.round(gap)} %`}</span>
        </div>
      </div>
      <figcaption>Aumento que pides sobre tu salario actual</figcaption>
    </figure>
  );
}

function MarketBar({ note }: { note: NegotiationNote }) {
  const m = note.market;
  if (!m) return null;
  const cur = note.suggestedRange.currency;
  const lo = Math.min(m.minGTQ, note.desiredMonthlyGTQ) * 0.9;
  const hi = Math.max(m.maxGTQ, note.desiredMonthlyGTQ) * 1.05;
  const pct = (v: number) => ((v - lo) / (hi - lo)) * 100;
  const f = (gtq: number) => formatMoney(fromGTQ(gtq, cur), cur);
  return (
    <figure className="market" aria-label="Tu expectativa contra el rango de mercado">
      <div className="market-track">
        <div className="market-range" style={{ left: `${pct(m.minGTQ)}%`, width: `${pct(m.maxGTQ) - pct(m.minGTQ)}%` }} />
        <div className="market-median" style={{ left: `${pct(m.medianGTQ)}%` }} title={`Mediana ${f(m.medianGTQ)}`} />
        <div className="market-you" style={{ left: `${pct(note.desiredMonthlyGTQ)}%` }}>
          <span>tú</span>
        </div>
      </div>
      <div className="market-legend">
        <span>{f(m.minGTQ)}</span>
        <span>mediana {f(m.medianGTQ)}</span>
        <span>{f(m.maxGTQ)}</span>
      </div>
    </figure>
  );
}

export function CarbonNote({ note }: { note: NegotiationNote }) {
  return (
    <section className="carbon" aria-labelledby="note-title" data-testid="note">
      <header className="carbon-head">
        <h2 id="note-title">Copia privada: nota de negociación</h2>
        <p className="private-seal">
          <LockIcon /> Solo para ti, no sale de tu dispositivo
        </p>
      </header>
      <p className="carbon-headline">{note.headline}</p>
      <GapRuler gap={note.gapPct} />
      <MarketBar note={note} />
      {note.sections.map((s) => (
        <div key={s.id} className="carbon-section" data-section={s.id}>
          <h3>{s.title}</h3>
          <ul>
            {s.items.map((it, i) => (
              <li key={i}>{it}</li>
            ))}
          </ul>
        </div>
      ))}
      <p className="carbon-foot">{note.fxNote}</p>
    </section>
  );
}

// ---------------------------------------------------------------------------
// What went to the cloud
// ---------------------------------------------------------------------------

export function CloudManifest({ outgoing, profile }: { outgoing: OutgoingRecord[]; profile: Profile }) {
  return (
    <section className="manifest" aria-labelledby="manifest-title" data-testid="manifest">
      <h2 id="manifest-title">Qué salió a la nube</h2>
      <p className="manifest-lead">
        Cada cuerpo JSON exacto que tu navegador envió, y lo que nuestro servidor reenvió a cada API. Nada más salió.
      </p>
      {outgoing.length === 0 ? (
        <p className="manifest-empty">Nada. Esta vez todo se resolvió en tu dispositivo.</p>
      ) : (
        <ul className="manifest-list">
          {outgoing.map((r, i) => (
            <li key={i} className={r.blocked ? "is-blocked" : undefined}>
              <div className="manifest-row">
                <strong>{API_META[r.destination].name}</strong>
                <code>POST {r.route}</code>
                {r.blocked && <span className="blocked-label">no se envió</span>}
              </div>
              {r.blocked ? (
                <p className="blocked-reason">{r.blockedReason}</p>
              ) : (
                <>
                  <pre>{JSON.stringify(r.body, null, 2)}</pre>
                  {r.upstream !== undefined && (
                    <details>
                      <summary>Lo que el servidor reenvió a {API_META[r.destination].name}</summary>
                      <pre>{formatUpstream(r.upstream)}</pre>
                    </details>
                  )}
                </>
              )}
            </li>
          ))}
        </ul>
      )}
      <div className="stayed">
        <h3>
          <LockIcon /> Se quedó en tu dispositivo
        </h3>
        <dl>
          <dt>Salario actual</dt>
          <dd>{formatMoney(profile.currentSalary, profile.currentCurrency)}</dd>
          <dt>Salario deseado</dt>
          <dd>{formatMoney(profile.desiredSalary, profile.desiredCurrency)}</dd>
          <dt>Empleador actual</dt>
          <dd>{profile.currentEmployer || "no indicado"}</dd>
          <dt>Tu nombre</dt>
          <dd>{profile.name || "no indicado"}</dd>
          <dt>Puesto actual</dt>
          <dd>{profile.currentRole || "no indicado"}</dd>
        </dl>
      </div>
    </section>
  );
}

function formatUpstream(u: unknown): string {
  if (u && typeof u === "object" && "prompt" in u) {
    const { prompt, ...rest } = u as { prompt: string };
    return `${JSON.stringify(rest, null, 2)}\n\n${prompt}`;
  }
  return JSON.stringify(u, null, 2);
}
