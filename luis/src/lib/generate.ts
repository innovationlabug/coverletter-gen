/**
 * Client orchestrator.
 *
 *   profile ──► router (allowlist + redactor + validator)
 *      │            ├─► /api/company (Tavily)  ┐ in parallel
 *      │            └─► /api/salary  (JSearch) ┘ (cache-first)
 *      │            └─► /api/letter  (Gemini, with redacted Tavily facts)
 *      └──────────► negotiation note + template letter (local, always available)
 *
 * Every step reports its status and every body that leaves the browser is
 * recorded (result.statuses / result.outgoing) for tests and debugging. The UI
 * only uses them to word its single progress line and plain-language notices.
 */
import { CLIENT_TIMEOUTS_MS, SIGNATURE_TOKEN, SLOW_THRESHOLD_MS } from "@/config/constants";
import { fetchLetter, LETTER_ROUTE } from "./apis/gemini";
import { fetchSalaryBenchmark, SALARY_ROUTE } from "./apis/jsearch";
import { defaultIsOnline, type PolicyOutcome } from "./apis/policy";
import { COMPANY_ROUTE, fetchCompanyFacts } from "./apis/tavily";
import { buildNegotiationNote, type NegotiationNote } from "./negotiation";
import { buildCloudPayload, SensitiveDataError, type BuiltPayload } from "./router";
import { safeLocalStorage, type StorageLike } from "./storage";
import { buildTemplateLetter } from "./template";
import type {
  ApiStatusInfo,
  CompanyFact,
  Destination,
  OutgoingRecord,
  Profile,
  SalaryBenchmark,
} from "./types";

export interface GenerateOptions {
  fetchImpl?: typeof fetch;
  storage?: StorageLike | null;
  isOnline?: () => boolean;
  timeouts?: Partial<Record<Destination, number>>;
  backoffMs?: number;
  baseUrl?: string;
  now?: () => number;
  onStatus?: (destination: Destination, info: ApiStatusInfo) => void;
  onOutgoing?: (record: OutgoingRecord) => void;
}

export interface LetterOutput {
  text: string;
  source: "gemini" | "template";
  usedFacts: CompanyFact[];
  fallbackReason?: string;
}

export interface GenerateResult {
  letter: LetterOutput;
  note: NegotiationNote;
  facts: CompanyFact[];
  benchmark: SalaryBenchmark | null;
  statuses: Record<Destination, ApiStatusInfo>;
  outgoing: OutgoingRecord[];
}

const ROUTES: Record<Destination, string> = {
  tavily: COMPANY_ROUTE,
  jsearch: SALARY_ROUTE,
  gemini: LETTER_ROUTE,
};

const FAILURE_TEXT: Record<string, string> = {
  not_subscribed: "la cuenta no está suscrita a la API (403)",
  upstream_auth: "credencial rechazada por el proveedor",
  not_configured: "falta la API key en el servidor",
  rate_limited: "límite de uso alcanzado (429)",
  upstream_error: "el proveedor devolvió un error",
  invalid_request: "petición rechazada por validación",
  sensitive_data: "el servidor detectó datos sensibles y rechazó el envío",
};

export function statusFromOutcome(
  destination: Destination,
  outcome: PolicyOutcome<unknown>,
): ApiStatusInfo {
  const base = { durationMs: outcome.durationMs, attempts: outcome.attempts };
  if (outcome.ok) {
    const slow = outcome.durationMs > SLOW_THRESHOLD_MS[destination];
    return {
      ...base,
      status: slow ? "slow" : "ok",
      detail: `${(outcome.durationMs / 1000).toFixed(1)} s${outcome.attempts > 1 ? ` · ${outcome.attempts} intentos` : ""}`,
    };
  }
  switch (outcome.kind) {
    case "offline":
      return { ...base, status: "offline", detail: "sin conexión: no se intentó" };
    case "network":
      return { ...base, status: "offline", detail: `no se pudo conectar (${outcome.attempts} intentos)` };
    case "timeout":
      return { ...base, status: "timeout", detail: outcome.message };
    default: {
      const reason = (outcome.code && FAILURE_TEXT[outcome.code]) || outcome.message;
      return {
        ...base,
        status: "failed",
        detail: `${reason}${outcome.status ? ` · HTTP ${outcome.status}` : ""}${
          outcome.attempts > 1 ? ` · ${outcome.attempts} intentos` : ""
        }`,
      };
    }
  }
}

export function applySignature(letter: string, name: string): string {
  const signature = name.trim() || "[Tu nombre]";
  if (letter.includes(SIGNATURE_TOKEN)) return letter.split(SIGNATURE_TOKEN).join(signature);
  return `${letter.trimEnd()}\n\n${signature}`;
}

function describeBlock(e: SensitiveDataError): string {
  const kinds = [...new Set(e.findings.map((f) => f.kind))];
  const labels: Record<string, string> = {
    employer: "tu empleador actual",
    salary: "un salario",
    money: "un monto",
    email: "un correo",
    phone: "un teléfono",
    dpi: "un DPI",
    nit: "un NIT",
    name: "tu nombre",
  };
  const field = e.field?.replace(/^\$\./, "") ?? "payload";
  return `bloqueado: ${kinds.map((k) => labels[k] ?? k).join(", ")} en «${field}»`;
}

export async function generate(profile: Profile, options: GenerateOptions = {}): Promise<GenerateResult> {
  const isOnline = options.isOnline ?? defaultIsOnline;
  const storage = options.storage === undefined ? safeLocalStorage() : options.storage;
  const timeouts = { ...CLIENT_TIMEOUTS_MS, ...options.timeouts };
  const outgoing: OutgoingRecord[] = [];
  const statuses: Record<Destination, ApiStatusInfo> = {
    tavily: { status: "idle" },
    jsearch: { status: "idle" },
    gemini: { status: "idle" },
  };
  const setStatus = (d: Destination, info: ApiStatusInfo) => {
    statuses[d] = info;
    options.onStatus?.(d, info);
  };
  const record = (r: Omit<OutgoingRecord, "at">) => {
    const rec = { ...r, at: new Date(options.now?.() ?? Date.now()).toISOString() };
    outgoing.push(rec);
    options.onOutgoing?.(rec);
    return rec;
  };
  const common = (d: Destination) => ({
    fetchImpl: options.fetchImpl,
    isOnline,
    baseUrl: options.baseUrl,
    backoffMs: options.backoffMs,
    now: options.now,
    timeoutMs: timeouts[d],
  });

  /** Router step: returns null (and records a blocked entry) if the validator refuses. */
  function route<D extends Destination>(d: D, facts?: CompanyFact[]): BuiltPayload<D> | null {
    try {
      return buildCloudPayload(profile, d, { facts });
    } catch (e) {
      if (e instanceof SensitiveDataError) {
        const detail = describeBlock(e);
        setStatus(d, { status: "blocked", detail });
        record({ destination: d, route: ROUTES[d], body: null, blocked: true, blockedReason: detail });
        return null;
      }
      throw e;
    }
  }

  const online = isOnline();

  // --- 1. Tavily + JSearch in parallel ------------------------------------
  const tavilyTask = (async (): Promise<CompanyFact[]> => {
    if (!online) {
      setStatus("tavily", { status: "offline", detail: "sin conexión: no se intentó" });
      return [];
    }
    const built = route("tavily");
    if (!built) return [];
    setStatus("tavily", { status: "loading" });
    const rec = record({ destination: "tavily", route: COMPANY_ROUTE, body: built.payload });
    const { outcome, facts } = await fetchCompanyFacts(built.payload, common("tavily"));
    if (outcome.ok) rec.upstream = outcome.data.upstream;
    setStatus("tavily", statusFromOutcome("tavily", outcome));
    return facts;
  })();

  const jsearchTask = (async (): Promise<{ benchmark: SalaryBenchmark | null; fromCache: boolean; reason: string | null }> => {
    const built = route("jsearch");
    if (!built) return { benchmark: null, fromCache: false, reason: "Envío a JSearch bloqueado por el validador." };
    setStatus("jsearch", { status: "loading" });
    // Cache lookup happens inside; offline with a fresh cache still works.
    const res = await fetchSalaryBenchmark(built.payload, {
      ...common("jsearch"),
      storage,
      isOnline: online ? isOnline : () => false,
    });
    if (res.source === "cache") {
      const days = res.cachedAt ? Math.floor(((options.now?.() ?? Date.now()) - res.cachedAt) / 86_400_000) : 0;
      setStatus("jsearch", {
        status: "cached",
        detail: `guardado hace ${days === 0 ? "menos de un día" : `${days} día${days === 1 ? "" : "s"}`} · no se gastó cuota`,
      });
      return { benchmark: res.benchmark, fromCache: true, reason: null };
    }
    if (res.outcome && !(res.outcome.ok === false && res.outcome.kind === "offline")) {
      const rec = record({ destination: "jsearch", route: SALARY_ROUTE, body: built.payload });
      if (res.outcome.ok) rec.upstream = res.outcome.data.upstream;
    }
    const info = res.outcome ? statusFromOutcome("jsearch", res.outcome) : { status: "failed" as const };
    setStatus("jsearch", info);
    if (res.benchmark) return { benchmark: res.benchmark, fromCache: false, reason: null };
    const reason =
      res.outcome?.ok === true
        ? "JSearch no tiene datos para ese puesto y ubicación."
        : `Sin referencia de mercado (JSearch: ${info.detail ?? info.status}).`;
    return { benchmark: null, fromCache: false, reason };
  })();

  const [facts, market] = await Promise.all([tavilyTask, jsearchTask]);

  // --- 2. Local negotiation note (always) ----------------------------------
  const note = buildNegotiationNote({
    profile,
    benchmark: market.benchmark,
    benchmarkFromCache: market.fromCache,
    benchmarkUnavailableReason: market.reason,
  });

  // --- 3. Gemini letter, or local template ---------------------------------
  let letter: LetterOutput | null = null;
  let fallbackReason: string | undefined;
  if (!online) {
    setStatus("gemini", { status: "offline", detail: "sin conexión: se usó la plantilla local" });
    fallbackReason = "Sin conexión";
  } else {
    const built = route("gemini", facts);
    if (!built) {
      fallbackReason = statuses.gemini.detail;
    } else {
      setStatus("gemini", { status: "loading" });
      const rec = record({ destination: "gemini", route: LETTER_ROUTE, body: built.payload });
      const outcome = await fetchLetter(built.payload, common("gemini"));
      setStatus("gemini", statusFromOutcome("gemini", outcome));
      if (outcome.ok && outcome.data.letter.trim()) {
        rec.upstream = outcome.data.upstream;
        const used = new Set(outcome.data.usedFacts);
        letter = {
          text: applySignature(outcome.data.letter, profile.name),
          source: "gemini",
          usedFacts: facts.filter((f) => used.has(f.id)),
        };
      } else {
        fallbackReason = statuses.gemini.detail ?? "Gemini no respondió";
      }
    }
  }
  if (!letter) {
    const t = buildTemplateLetter(profile);
    letter = { text: t.text, source: "template", usedFacts: [], fallbackReason };
  }

  return { letter, note, facts, benchmark: market.benchmark, statuses, outgoing };
}
