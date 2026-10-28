// Copies the face models used in the browser from node_modules to public/models (not committed: 13 MB of binaries).
import { cpSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const source = join("node_modules", "@vladmandic", "human", "models");
const target = join("public", "models");
const models = ["blazeface", "facemesh", "iris", "faceres", "antispoof", "liveness"];

if (!existsSync(source)) {
  console.warn("Face models not found; run npm install first.");
  process.exit(0);
}
mkdirSync(target, { recursive: true });
for (const m of models) {
  for (const ext of ["json", "bin"]) cpSync(join(source, `${m}.${ext}`), join(target, `${m}.${ext}`));
}
console.log(`Copied ${models.length} face models to ${target}`);
