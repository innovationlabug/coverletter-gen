# Resultados de la evaluación

Un archivo JSON por corrida (`npm run eval`), con todas las cartas, verificaciones, notas del juez y el detalle de fugas.

- `2026-09-25T23-27-29-934Z.json` — **corrida reportada en `VALIDACION.md`** (posiciones del juez balanceadas).
- `2026-09-25T23-10-59-011Z.json` — corrida anterior con las mismas cartas, cuyo orden "aleatorio" del juez dejó la carta de la nube 12 de 18 veces en la posición C (ver `docs/decisiones.md`). Se conserva como evidencia.
- `*-leaks.json` / `*-leaks.md` — corridas de `npm run eval -- --leaks-only`.
