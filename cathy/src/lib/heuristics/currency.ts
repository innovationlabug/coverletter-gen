import type { Currency } from "../types";

/**
 * Tipo de cambio de referencia GTQ por USD.
 * Valor aproximado del tipo de cambio de referencia del Banguat (2025–2026, ~7.66–7.75).
 * Es una CONSTANTE a propósito: solo sirve para comparar órdenes de magnitud entre un
 * salario en quetzales y una oferta en dólares; no es contabilidad. Cambiarla aquí la
 * cambia en toda la app, en las pruebas y en el benchmark.
 *
 * Por qué no necesita modelo: una conversión es una multiplicación. Un LLM de 2B que
 * "convierte" monedas se equivoca en decimales y no deja rastro auditable.
 */
export const GTQ_PER_USD = 7.7;

export function toGTQ(amount: number, currency: Currency): number {
  return currency === "USD" ? amount * GTQ_PER_USD : amount;
}

export function fromGTQ(amountGTQ: number, currency: Currency): number {
  return currency === "USD" ? amountGTQ / GTQ_PER_USD : amountGTQ;
}

export function formatMoney(amount: number, currency: Currency): string {
  const rounded = Math.round(amount);
  const s = rounded.toLocaleString("en-US");
  return currency === "USD" ? `US$${s}` : `Q${s}`;
}
