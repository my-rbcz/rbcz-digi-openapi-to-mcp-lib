import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));

export function loadFixture(name: string): string {
    return readFileSync(resolve(here, name), "utf8");
}
