"use client";

import type { GenerateResult } from "@/lib/orchestrator";

const SENSITIVE = new Set(["currentSalary", "desiredSalary", "currentEmployer", "email", "phone"]);

function Fields({ names }: { names: string[] }) {
  return (
    <div className="fields">
      {names.map((n) => (
        <code key={n} className={SENSITIVE.has(n) ? "sensitive" : ""}>
          {n}
        </code>
      ))}
    </div>
  );
}

export function TierPanel({ result }: { result: GenerateResult }) {
  const { trace } = result;
  return (
    <section className="sheet" data-testid="tiers">
      <div className="sheet-head">
        <div>
          <div className="eyebrow">Bitácora · qué salió hacia dónde</div>
          <h2>Tiers de confianza</h2>
        </div>
        <span className="hand">decidido por router.ts, no por un modelo</span>
      </div>

      <div className="tier-row">
        <div className="tier-id t0">
          <div className="num">0</div>
          <div className="where">Tu navegador</div>
        </div>
        <div>
          <p className="tier-desc">Todo el perfil. Aquí corren las heurísticas: brecha, bandas, tipo de cambio, rango de la oferta, idioma, seniority, redactor.</p>
          <Fields names={trace.device} />
        </div>
      </div>

      <div className="tier-row" data-testid="tier-1">
        <div className="tier-id t1">
          <div className="num">1</div>
          <div className="where">Ollama privado · Cloud Run del dueño · IAM</div>
        </div>
        <div>
          {trace.private.length === 0 ? (
            <p className="tier-desc">Nada (modo offline).</p>
          ) : (
            trace.private.map((e) => (
              <div key={e.endpoint} style={{ marginBottom: 10 }}>
                <p className="tier-desc">
                  <code>POST {e.endpoint}</code> ·{" "}
                  {e.status === "ok" ? <span className="badge ok">ok</span> : <span className="badge warn">falló → respaldo</span>}
                </p>
                <Fields names={e.fields} />
                {e.note && <p className="note-small">{e.note}</p>}
              </div>
            ))
          )}
          <p className="note-small">
            Incluye el salario actual: es un servicio propio, sin terceros, con acceso solo por cuenta de servicio. Ver “la decisión de la nube
            privada” en el README.
          </p>
        </div>
      </div>

      <div className="tier-row" data-testid="tier-2">
        <div className="tier-id t2">
          <div className="num">2</div>
          <div className="where">Gemini · Vertex AI · tercero</div>
        </div>
        <div>
          {trace.thirdParty ? (
            <>
              <p className="tier-desc">
                <code>POST {trace.thirdParty.endpoint}</code> ·{" "}
                {trace.thirdParty.status === "ok" ? <span className="badge ok">ok</span> : <span className="badge warn">falló → plantilla</span>} ·{" "}
                <span className="badge muted">{result.redactionsOnDevice} redacciones en el navegador</span>
              </p>
              <Fields names={trace.thirdParty.fields} />
            </>
          ) : (
            <p className="tier-desc">Nada salió (offline). La plantilla usó el mismo payload redactado:</p>
          )}
          <details className="payload">
            <summary>ver el JSON exacto {trace.thirdParty ? "enviado a Gemini" : "que se habría enviado"}</summary>
            <pre data-testid="t2-payload">{JSON.stringify(result.thirdPartyPayload, null, 2)}</pre>
          </details>
        </div>
      </div>
    </section>
  );
}
