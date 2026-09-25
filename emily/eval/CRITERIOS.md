# Criterios de calidad de la carta

Cada carta (local, nube y plantilla) se califica en **6 criterios**, dos veces:

1. con una **regla determinista** (código en `src/lib/letter-checks.ts`, la misma que muestra la app debajo de cada carta), que da *pasa / no pasa*;
2. con un **juez** (`gemini-3.8-flash`, temperatura 0, a ciegas) que da una nota de **1 a 5** usando las anclas de abajo (código en `eval/lib/judge.ts`).

Reportamos las dos cosas y cuánto coinciden (acuerdo y κ de Cohen entre "pasa la regla" y "juez ≥ 4"). La regla es barata, reproducible y no tiene sesgos de modelo, pero es miope; el juez entiende el texto, pero puede equivocarse o tener preferencias. Ninguna de las dos es la verdad; juntas dicen más.

## 1. Ajuste a la oferta

**Por qué importa:** una carta genérica es la razón número uno por la que un reclutador deja de leer. Si el usuario pegó la oferta, la carta tiene que responderle.

- **Regla:** menciona la empresa destino **y** alguna palabra del puesto deseado **y** al menos el 30 % de las 10 palabras más salientes de la oferta (palabras de 5+ letras, sin palabras vacías, por frecuencia; se compara por raíz de 5+ letras). Sin oferta, basta empresa + puesto.
- **Juez:** 1 = genérica, podría enviarse a cualquier empresa · 3 = menciona puesto, empresa y algún requisito sin conectarlo con experiencia concreta · 5 = conecta explícitamente varios requisitos con experiencias y logros del candidato.
- **Limitación conocida:** la regla premia repetir vocabulario de la oferta aunque la conexión sea superficial (la plantilla lo hace a propósito).

## 2. Cero datos inventados

**Por qué importa:** una carta con una cifra o un empleador inventado es peor que una carta sosa: el candidato queda como mentiroso en la entrevista. Y para esta app en particular, una carta que menciona el salario es una fuga hacia un tercero.

- **Regla:** (a) ningún número de la carta que no esté en los datos del usuario; (b) nada prohibido: salario actual o deseado en cualquier forma, teléfonos, correos, DPI, NIT, direcciones, nombres de terceros, etiquetas sin reemplazar (`[SALARIO]`, `{{NOMBRE}}`); (c) como máximo 2 nombres propios en medio de oración que no aparezcan en los datos (aproximación a "empresas / herramientas / certificaciones inventadas").
- **Juez:** 1 = inventa cifras, empleadores, títulos, certificaciones o logros, o menciona salarios · 3 = sin cifras ni entidades inventadas pero con afirmaciones concretas no respaldadas · 5 = todo dato verificable está en los datos. Omitir datos no se penaliza (la carta de la nube no conoce el empleador ni los datos tachados).
- **Limitación conocida:** la regla no detecta logros inventados sin números ("lideré la transformación digital").

## 3. Tono profesional

**Por qué importa:** en Guatemala una carta formal se escribe de "usted"; el voseo, los emojis o el tono servil restan credibilidad.

- **Regla:** tiene saludo formal (Estimado/a, Señores, A quien corresponda, Apreciados…) y no tiene marcadores informales (vos/tenés/podés, "súper", "jaja", "!!", emojis, markdown, etiquetas sin reemplazar).
- **Juez:** 1 = informal, servil, agresivo o exagerado · 3 = correcto pero rígido o con clichés · 5 = profesional, cálido, seguro, de usted, sin exageraciones.

## 4. Longitud de 250 a 400 palabras

**Por qué importa:** es el rango que una persona de reclutamiento lee completo en menos de un minuto y el que pedimos explícitamente en el prompt; salirse indica que el modelo no sigue instrucciones.

- **Regla:** conteo de palabras entre 250 y 400 (inclusive).
- **Juez:** 1 = < 180 o > 480 · 3 = 180–249 o 401–480 · 5 = 250–400. El juez **no** recibe el conteo: medimos a propósito si un LLM sabe contar (suele no saber; se ve en el acuerdo de este criterio).

## 5. Español correcto

**Por qué importa:** una falta de ortografía en una carta de presentación es descalificante para muchos reclutadores, y los modelos pequeños cuantizados tienden a mezclar idiomas o "romper" palabras.

- **Regla (aproximación):** menos de 3 % de palabras funcionales en inglés; ninguna palabra común escrita sin su tilde obligatoria (informacion, tambien, gestion, tecnologia, area…); la carta no termina cortada.
- **Juez:** 1 = errores frecuentes o mezcla de idiomas · 3 = errores menores · 5 = sin errores.
- **Limitación conocida:** la regla no ve errores gramaticales ni palabras rotas ("se al aline"); aquí el juez es mucho mejor.

## 6. Cierre con llamada a la acción

**Por qué importa:** la carta existe para conseguir una entrevista; si no la pide, no hace su trabajo.

- **Regla:** en el último 40 % del texto aparece una invitación: entrevista, conversar, reunión, llamada, "quedo a su disposición", "me encantaría conversar", agendar…
- **Juez:** 1 = sin cierre o termina abruptamente · 3 = cierre cortés sin invitación clara · 5 = invita explícitamente a una entrevista o conversación y agradece.

## El juez: sesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| **Auto-preferencia**: el juez es el mismo modelo que escribió la carta de la nube y puede preferir su propio estilo. | Cartas a ciegas (A/B/C), instrucción explícita de no adivinar el origen, y reporte paralelo de la puntuación **solo determinista**, que no tiene auto-preferencia. En `VALIDACION.md` se compara "juez − reglas" por fuente: si la brecha es mucho mayor para la nube, es señal de sesgo. |
| **Sesgo de posición** (preferir la carta A o la última). | Posiciones **balanceadas**: las 6 permutaciones de (local, nube, plantilla), 3 casos cada una, así cada fuente cae 6 veces en A, 6 en B y 6 en C. Se reporta el promedio del juez por posición. (La primera corrida usaba un orden "aleatorio" con semilla que dejó la nube 12 de 18 veces en C: no servía.) |
| **Sesgo de longitud** (premiar cartas largas). | La rúbrica lo prohíbe explícitamente y la longitud tiene su propio criterio con anclas numéricas. |
| **Comparación entre cartas** en vez de evaluar cada una. | Instrucción de evaluar cada carta por sí misma. |
| **Variabilidad**. | Temperatura 0 y esquema JSON obligatorio (`responseSchema`). Las cartas se guardan en caché (`.cache/eval-letters`), así que repetir el juez no cambia las cartas. |

## Por qué la evaluación usa Vertex AI y no Firebase AI Logic

La app llama a `gemini-3.8-flash` con **Firebase AI Logic** desde el navegador (sin servidor propio). Ese SDK está pensado para clientes web/móviles y el proyecto de Firebase **exige App Check** para Gemini, así que no se puede invocar desde un script de Node sin un token de App Check. La evaluación usa **el mismo modelo** (`gemini-3.8-flash`), **el mismo prompt** (el que devuelve `buildCloudPayload`) y **la misma configuración de generación** (`LETTER_GENERATION`), pero llamado con `@google/genai` sobre **Vertex AI** (`vertexai: true`, proyecto `ai-experiments-487722`, región `global`, credenciales ADC). Diferencias posibles: el backend de Firebase (Gemini Developer API) y Vertex sirven el mismo modelo, pero pueden diferir en cuotas y filtros de seguridad por defecto; no esperamos diferencias de calidad.
