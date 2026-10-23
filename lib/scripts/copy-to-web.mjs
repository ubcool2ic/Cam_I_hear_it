/**
 * @file scripts/copy-to-web.mjs
 * @summary Copies the compiled library (dist/src/*.js) into ../web/lib/ so the static GitHub Pages site can import it.
 */
import { mkdirSync, readdirSync, copyFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const src = join(here, "..", "dist", "src");
const dst = join(here, "..", "..", "web", "lib");
mkdirSync(dst, { recursive: true });
for (const f of readdirSync(src)) if (f.endsWith(".js")) copyFileSync(join(src, f), join(dst, f));
console.log(`copied lib -> ${dst}`);
