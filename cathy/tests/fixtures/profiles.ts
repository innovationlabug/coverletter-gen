import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { Profile } from "@/lib/types";

export interface BenchInput {
  id: string;
  description: string;
  profile: Profile;
}

const dir = fileURLToPath(new URL("../../bench/inputs/", import.meta.url));

/** Los 12 perfiles ficticios del benchmark, reutilizados por las pruebas. */
export function loadInputs(): BenchInput[] {
  return readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .map((f) => JSON.parse(readFileSync(dir + f, "utf8")) as BenchInput);
}
