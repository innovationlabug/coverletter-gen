# Prueba didáctica del README

**Objetivo:** que alguien que nunca vio el proyecto lo corra siguiendo **solo** el [README](README.md), anotar dónde se traba y corregir el README hasta que funcione sin ayuda.

> **Transparencia:** la primera ronda la hizo un agente de IA sin contexto del proyecto. Clonó el repo en un directorio limpio y tenía prohibido leer el código fuente o la copia de trabajo de la autora. Sirve para encontrar huecos, pero **no reemplaza la prueba con una persona real**. Ese paso queda pendiente para Emily (ver el final de este documento).

## Ronda 1 — 25/9/2026, commit `f295b75`

**Veredicto:** *sí se puede correr sin ayuda* (app, nota, plantilla, modo sin conexión, pruebas unitarias y e2e, typecheck y evaluación rápida). La única pieza que no salió fue la **carta de la nube**, porque exige App Check. Tiempo total: unos 4 minutos de comandos, más la navegación.

**Lo que funcionó a la primera:**

- versiones de Node, npm y Firebase CLI iguales a las del README;
- `.env.local` ignorado por git;
- `firebase apps:list` y `apps:sdkconfig`;
- `npm run dev` y el ejemplo completo (nota y plantilla);
- `npm test` (115/115) y `npm run test:e2e` (6/6);
- `npm run eval -- --leaks-only`, con el mismo resultado que [VALIDACION.md](VALIDACION.md).

### Dónde se trabó

| # | Paso | Qué pasó | Severidad | Corrección aplicada |
|---|---|---|---|---|
| 1 | §1 Arquitectura | La imagen `docs/diagrams/arquitectura.png` no existía: lo primero que veía era una imagen rota. | confuso | Se agregó el diagrama. |
| 2 | Antes del §3 | El README no decía que se necesita acceso al repo privado **y** ser miembro del proyecto de Firebase. Para un externo, el §3.1 es un callejón sin salida. | confuso (bloqueante sin acceso) | Nueva sección "Quién puede seguir este README", con qué hacer si no tenés acceso a Firebase. |
| 3 | §3 `npm ci` | `EACCES` en la caché de npm. | menor | Ya estaba cubierto en *Solución de problemas*, y funcionó con `--cache`. |
| 4 | §3 `npm ci` | npm 12 bloquea scripts de 6 paquetes, pero el README nombraba 2. `node_modules` pesa ~850 MB, no ~700 MB. | menor | Lista completa de paquetes y tamaño corregido. |
| 5 | §3.1 | `apps:sdkconfig` imprime JSON puro con 2 campos de más, no "un objeto `firebaseConfig`". | menor | Se explica qué 7 campos copiar. |
| 6 | §3.2 App Check | La carta de la nube pedía un token de depuración que solo se crea en la consola, y `.env.example` no tenía la variable. | bloqueante (solo la carta de la nube) | Ahora hay una **clave de reCAPTCHA Enterprise** que acepta `localhost`: con esa variable, la carta de la nube funciona en desarrollo sin token de depuración. `.env.example` lista las dos variables. |
| 7 | §3.3 paso 4 | No quedaba claro si la descarga de 2.3 GB era obligatoria. | confuso | Marcada como *(opcional)*. |
| 8 | §5 `--leaks-only` | La salida muestra "12 fugas" y parece un fallo, aunque es el resultado esperado. | confuso | Se agregó la salida esperada y qué número **nunca** debe cambiar (salario en el payload = 0). Los `*-leaks.*` quedan en `.gitignore`. |
| 9 | §5 eval completa | El proyecto de Vertex estaba fijo en el código. | menor | Se lee de la variable `VERTEX_PROJECT`, con el valor anterior por defecto. |
| 10 | Varios | Versiones y tiempos de ejemplo desactualizados (gcloud, e2e ~30 s, descarga de Playwright). | menor | Actualizados. |
| 11 | README raíz | Mencionaba `DIDACTICA.md` y `TEMAS.md` antes de que existieran. | menor | Ahora existen. |

### Qué aprendimos de la prueba

- **La primera fricción fue visual, no técnica.** Una imagen rota al principio le quita confianza a todo lo que sigue.
- **Los permisos son parte de las instrucciones.** El README asumía que quien lo leyera era la dueña del proyecto. Escribir "quién puede seguir esto" y "qué hacer si no podés" cambió un bloqueo por un desvío.
- **Una salida correcta que parece un error es un error de documentación.** El `--leaks-only` reporta fugas *a propósito* (son los casos difíciles), y sin decirlo asusta.
- **La tabla de *Solución de problemas* funcionó.** El único error real (`EACCES`) se resolvió sin ayuda porque estaba ahí.

## Pendiente: ronda con una persona real

1. Elegir a alguien del equipo que no haya visto el proyecto.
2. Darle solo el enlace al repo y este README. No ayudarle.
3. Anotar en esta tabla cada vez que pregunte algo o se detenga más de 2 minutos.
4. Corregir el README y repetir con otra persona hasta que no haya fricciones bloqueantes.
