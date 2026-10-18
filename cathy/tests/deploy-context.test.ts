import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { copyFileSync, mkdtempSync, readdirSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * `gcloud builds submit` sube el código según .gcloudignore, que sigue la sintaxis de
 * .gitignore: un patrón sin "/" (p. ej. `ollama`) excluye CUALQUIER carpeta con ese nombre,
 * también src/app/api/ollama. Así la imagen salía sin el proxy a Ollama y en producción
 * /api/ollama/* respondía 404. Esta prueba revisa que ningún archivo que necesita el build
 * quede fuera del contexto que se sube (.gcloudignore) ni del de Docker (.dockerignore).
 */
const root = fileURLToPath(new URL("..", import.meta.url));

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [relative(root, full)];
  });
}

const buildInputs = [
  ...walk(join(root, "src")),
  ...walk(join(root, "public")),
  "package.json",
  "package-lock.json",
  "next.config.ts",
  "tsconfig.json",
  "Dockerfile",
];

/**
 * Rutas que el archivo de ignore (sintaxis .gitignore) deja fuera, evaluadas en un repo git
 * temporal para que "/" signifique la raíz del contexto (como lo hace gcloud), no la del monorepo.
 */
function ignoredBy(ignoreFile: string, paths: string[]): string[] {
  const dir = mkdtempSync(join(tmpdir(), "ctx-"));
  try {
    execFileSync("git", ["init", "-q"], { cwd: dir });
    copyFileSync(join(root, ignoreFile), join(dir, ".gitignore"));
    const out = execFileSync("git", ["check-ignore", "--no-index", "--stdin"], {
      cwd: dir,
      input: paths.join("\n"),
      encoding: "utf8",
    });
    return out.split("\n").filter(Boolean);
  } catch (err) {
    // git check-ignore sale con 1 cuando nada coincide.
    if ((err as { status?: number }).status === 1) return [];
    throw err;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe("contexto de despliegue", () => {
  it("incluye la ruta /api/ollama/[task] (la que fallaba)", () => {
    expect(buildInputs).toContain(join("src", "app", "api", "ollama", "[task]", "route.ts"));
  });

  for (const file of [".gcloudignore", ".dockerignore"]) {
    it(`${file} no excluye nada de lo que necesita el build`, () => {
      expect(ignoredBy(file, buildInputs)).toEqual([]);
    });

    it(`${file} sigue dejando fuera la carpeta ollama/ de la raíz y node_modules`, () => {
      expect(ignoredBy(file, ["ollama/Dockerfile", "node_modules/next/package.json"])).toEqual([
        "ollama/Dockerfile",
        "node_modules/next/package.json",
      ]);
    });
  }
});
