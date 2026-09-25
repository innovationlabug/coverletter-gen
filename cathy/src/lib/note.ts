import type { NegotiationFacts } from "./facts";
import { formatMoney } from "./heuristics/currency";

/**
 * Nota de negociación 100 % heurística. Siempre se muestra (online u offline): los números
 * que ve la persona salen de aquí y de nada más.
 */
export interface HeuristicNote {
  headline: string;
  figures: Array<{ label: string; value: string }>;
  bandLabel: string;
  advice: string;
  timing: { moment: string; why: string };
  rangeNote: string | null;
}

export function buildHeuristicNote(f: NegotiationFacts): HeuristicNote {
  const sign = f.gapPct >= 0 ? "+" : "";
  const figures = [
    { label: "Hoy", value: `${formatMoney(f.current.amount, f.current.currency)}/mes` },
    { label: "Expectativa", value: `${formatMoney(f.desired.amount, f.desired.currency)}/mes` },
    { label: "Brecha", value: `${sign}${f.gapPct} %` },
    { label: "Diferencia", value: `${f.deltaGTQ >= 0 ? "+" : "−"}${formatMoney(Math.abs(f.deltaGTQ), "GTQ")}/mes` },
  ];
  if (f.current.currency !== f.desired.currency) {
    figures.push({ label: "Tipo de cambio", value: `Q${f.gtqPerUsd} por US$1` });
  }
  let rangeNote: string | null = null;
  if (f.offerRange) {
    const r = f.offerRange;
    const lo = r.min != null ? formatMoney(r.min, r.currency) : "—";
    const hi = r.max != null ? formatMoney(r.max, r.currency) : "—";
    const per = r.period === "year" ? " anuales" : "/mes";
    const pos =
      f.desiredVsRange === "within"
        ? "cae dentro del rango"
        : f.desiredVsRange === "above"
          ? `queda ${f.pctVsRangeMax} % por encima del tope`
          : "queda por debajo del piso: estás pidiendo menos de lo que ofrecen";
    rangeNote = `La oferta publica ${lo} – ${hi}${per}; tu expectativa ${pos}.`;
  }
  return {
    headline: `${f.bandLabel}: pides ${sign}${f.gapPct} % respecto a lo que ganas hoy.`,
    figures,
    bandLabel: f.bandLabel,
    advice: f.bandAdvice,
    timing: f.timing,
    rangeNote,
  };
}

export function noteToText(n: HeuristicNote): string {
  return [
    n.headline,
    n.figures.map((x) => `${x.label}: ${x.value}`).join(" · "),
    n.rangeNote ?? "",
    n.advice,
    `Cuándo mencionarlo: ${n.timing.moment} ${n.timing.why}`,
  ]
    .filter(Boolean)
    .join("\n");
}
