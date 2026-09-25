# Bitácora de decisiones y errores (Luis · APIs)

Registro de lo que realmente pasó al construir la app, en orden. Material para el artículo.

## Stack y andamiaje

1. **Next.js 16.3.6 + React 19.2, TypeScript 5.9 (no 7).** `npm view typescript` ya da 7.0.2 (el compilador nativo), pero `create-next-app@latest` sigue instalando `typescript@^5`. Me quedé con lo que Next valida.
2. **`next dev` crea `AGENTS.md` y `CLAUDE.md` solo** cuando detecta un agente de IA (ver `node_modules/next/dist/server/lib/generate-agent-files.js`). En este repo no queremos esos archivos, así que `next.config.ts` lleva `agentRules: false`. Opción no documentada en la guía, solo en los tipos (`config-shared.d.ts`).
3. **`export const dynamic` ya no aparece en la referencia de route segment config de Next 16** (queda solo con el modelo de caché previo). Las rutas `POST` son dinámicas por naturaleza; dejé solo `runtime = "nodejs"` (explícito, el edge runtime está deprecado) y `maxDuration = 30`.
4. **Context7 no funcionó** (API key inválida), así que la documentación se revisó con la guía PWA de nextjs.org, los docs locales de `node_modules/next/dist/docs/`, los tipos de `@google/genai` y la referencia de Tavily.
5. **Vitest 5** advierte si `vitest.config.ts` usa ESM en un paquete CommonJS; se renombró a `vitest.config.mts`.

## Privacidad

6. **El nombre no se envía a nadie.** Primero pensé en mandarlo a Gemini para la firma. Mejor: Gemini termina la carta con el marcador `[[FIRMA]]` y el navegador lo reemplaza. Cero costo, cero riesgo. Efecto colateral real: en la primera carta de prueba Gemini escribió "Estoy **convencido**" para Ana Lucía. Sin nombre no conoce el género, así que se agregó al prompt "usa formulaciones neutras". Privacidad y calidad chocan en lugares inesperados.
7. **Tampoco se envía el salario deseado.** La carta no debe mencionar cifras y JSearch no lo necesita (solo puesto, ubicación y años).
8. **Empresa destino = empleador actual → bloquear.** Podría ser una postulación interna, pero en lugar de adivinar, el validador bloquea Tavily y Gemini y se usa la plantilla. La UI lo explica.
9. **Las URLs de Tavily no van a Gemini.** Contienen dígitos (IDs, fechas) que podrían disparar falsos positivos del validador de teléfonos y montos y bloquear el envío (decisión tomada al diseñar, no un error observado). Gemini recibe `[1] título — snippet`, devuelve `hechos_usados: [1, 3]` y el navegador pone las URLs. Además, Gemini no necesita la URL para escribir.
10. **Los hechos de Tavily también se redactan.** Son texto de terceros, pero pueden mencionar al empleador actual (competidor) o montos. En la prueba real, "más de 8 millones de usuarios" llegó a Gemini como "más de [monto] de usuarios". Sobre-redacción aceptada y documentada.
11. **El validador recorre cada string del payload, no el JSON serializado.** Con `JSON.stringify` un salto de línea queda como `\n` y "Q500" pasa a ser "nQ500": la regla `(?<![A-Za-z])Q` ya no lo ve. Validar valor por valor evita ese hueco.
12. **Redactar vs. bloquear.** Texto libre (logros, oferta, snippets) → se redacta. Campos estructurados (puesto, empresa, ubicación) → si queda algo, se **bloquea** el envío (`SensitiveDataError`), nunca se manda "igual".
13. **El servidor repite la validación** con zod `.strict()` (rechaza campos desconocidos: un cliente modificado no puede agregar `currentSalary`) y con el detector genérico de montos/identificadores (422). No puede revisar el salario exacto ni el empleador porque nunca los recibe, y está bien que así sea.
14. **La plantilla local elimina oraciones, no las redacta.** Una carta con "[monto]" no sirve para enviar; se descartan las oraciones con datos sensibles.
15. **El formulario no se persiste**, ni siquiera en `localStorage`: sería guardar el salario en disco sin necesidad.

## Pruebas

16. **Prueba de mutación del leak test.** Quité temporalmente la redacción y el validador del router: 5 de 9 casos fallaron (salario en logros, empleador con tildes, identificadores, bloqueo empresa=empleador). Sin eso no sabríamos si la prueba prueba algo.
17. **El leak test pasa por las rutas reales.** El `fetch` mockeado despacha `/api/*` a los handlers de verdad, y esos handlers llaman a Tavily/JSearch/Gemini (también mockeados). Así se revisan los dos saltos, incluido el que hace el SDK de Gemini (usa el `fetch` global).
18. **Bug real en el e2e offline: `page.waitForFunction` con función `async` no espera.** Devuelve una Promise, que es truthy, así que resolvía al instante. El test "pasaba" a veces (cuando había tiempo de sobra) y fallaba con `net::ERR_INTERNET_DISCONNECTED` cuando se desconectaba antes de que el service worker terminara de cachear. Diagnóstico: listar `caches.keys()` mostró el cache vacío. Solución: `expect.poll(() => page.evaluate(async …))`. Un `waitForTimeout(3000)` también "lo arreglaba", pero ocultaba el problema.
19. **Timeouts sin reintento.** El reintento aplica a 429/5xx/red. Si Gemini tardó 20 s, reintentar son 40 s de espera; mejor la plantilla inmediata. Un 504 de nuestra ruta se trata como timeout por la misma razón.

## APIs

20. **JSearch primero devolvía 403 "You are not subscribed to this API"**; se construyó contra la forma documentada y se manejó como `424 not_subscribed` (no reintentable). Después de suscribirse, la llamada real funcionó. Probar un valor inválido de `years_of_experience` devolvió la lista de valores válidos (`LESS_THAN_ONE … ABOVE_FIFTEEN`); con eso se mapea años → rango en vez de mandar siempre `ALL`. Para "Software Engineer / Guatemala / FOUR_TO_SIX" devolvió 25 salarios (Glassdoor, confianza VERY_HIGH, mensual, GTQ).
21. **Caché de JSearch "cache-first" también en línea**: el plan gratuito son 200 solicitudes al mes y el salario de mercado no cambia en una semana.
22. **Sin API de tipo de cambio**: constante de 7.75 GTQ/USD en `src/config/constants.ts`. Otra dependencia de red para una cifra que casi no se mueve no aporta a la decisión.
23. **El SDK `@google/genai` no reintenta por defecto** (solo si se pasan `retryOptions`), así que la única política de reintentos es la del cliente. Se usa `responseJsonSchema` + `responseMimeType: "application/json"` y `thinkingLevel: LOW` para bajar latencia (~2.5 s por carta en la prueba real).
24. **Service worker escrito a mano en lugar de Serwist.** Next 16 compila con Turbopack por defecto y Serwist necesita un paquete aparte para Turbopack (`@serwist/turbopack`). Un `public/sw.js` de ~150 líneas se entiende completo, no depende del bundler y se probó con Playwright offline. Para cachear los chunks con hash, en `install` se descarga `/` y se extraen las URLs `/_next/static/...` del HTML; además la página envía por `postMessage` las URLs que ya cargó.

## Resultados de la prueba real (smoke, `next dev`)

- Tavily: 200 en ~3 s, 3 resultados sobre Tigo Guatemala.
- JSearch: 200 en ~1.3 s, benchmark mensual en GTQ.
- Gemini `gemini-3.8-flash`: 200 en ~2.6 s, carta en español, cita 1–2 hechos, sin cifras ni empleador, termina en `[[FIRMA]]`.
- Flujo completo en navegador: ~4.9 s, 3 solicitudes, ninguna con salario, empleador ni nombre.
