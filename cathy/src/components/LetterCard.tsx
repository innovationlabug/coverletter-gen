"use client";

import type { GenerateResult } from "@/lib/orchestrator";
import { slugify } from "@/lib/money-input";
import { NAME_PLACEHOLDER } from "@/lib/form";
import { CopyIcon, DownloadIcon } from "./Icons";

/** El marcador de la firma se resalta para que no se vaya así en el correo. */
function WithPlaceholder({ text }: { text: string }) {
  const parts = text.split(NAME_PLACEHOLDER);
  if (parts.length === 1) return <>{text}</>;
  return (
    <>
      {parts.map((p, i) => (
        <span key={i}>
          {p}
          {i < parts.length - 1 && <mark className="placeholder">{NAME_PLACEHOLDER}</mark>}
        </span>
      ))}
    </>
  );
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Sin permiso o sin API (http, navegadores viejos): el camino de siempre.
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

function download(text: string, company: string) {
  const blob = new Blob([text.endsWith("\n") ? text : `${text}\n`], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const slug = slugify(company);
  a.href = url;
  a.download = slug ? `carta-${slug}.txt` : "carta.txt";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

interface Props {
  result: GenerateResult;
  company: string;
  onToast: (text: string, ok?: boolean) => void;
  onRetry: () => void;
}

export function LetterCard({ result, company, onToast, onRetry }: Props) {
  const { letter } = result;
  const offline = result.mode === "offline";
  const needsName = letter.text.includes(NAME_PLACEHOLDER);

  return (
    <section className="letter reveal" data-testid="letter" data-source={letter.source} aria-labelledby="letter-title">
      <div className="section-head">
        <h2 id="letter-title">Tu carta</h2>
        <div className="tools">
          <button
            type="button"
            className="tool"
            data-testid="copy-letter"
            onClick={async () => {
              const ok = await copyText(letter.text);
              onToast(ok ? "Copiada" : "No se pudo copiar. Selecciona el texto y cópialo.", ok);
            }}
          >
            <CopyIcon />
            Copiar
          </button>
          <button
            type="button"
            className="tool"
            data-testid="download-letter"
            onClick={() => {
              download(letter.text, company);
              onToast("Descargada");
            }}
          >
            <DownloadIcon />
            Descargar
          </button>
        </div>
      </div>
      {letter.source === "template" && (
        <p className="notice" data-testid="letter-basic">
          {offline ? (
            "Sin conexión te damos una versión básica. Revísala antes de enviarla."
          ) : (
            <>
              Esta vez te damos una versión básica. Revísala antes de enviarla o{" "}
              <button type="button" className="link" onClick={onRetry} data-testid="retry">
                vuelve a intentarlo
              </button>
              .
            </>
          )}
        </p>
      )}
      <article className="letter-text" data-testid="letter-text" aria-label="Texto de la carta">
        <WithPlaceholder text={letter.text} />
      </article>
      {needsName && (
        <p className="hint after-letter" data-testid="name-hint">
          Cambia {NAME_PLACEHOLDER} por tu nombre antes de enviarla.
        </p>
      )}
    </section>
  );
}
