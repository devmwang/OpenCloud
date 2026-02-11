import { rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "..");

const artifactDirs = [
    ".turbo",
    ".tanstack",
    "apps/server/.turbo",
    "apps/webui/.turbo",
    "apps/nova/.turbo",
];

for (const relativeDir of artifactDirs) {
    rmSync(resolve(repoRoot, relativeDir), { recursive: true, force: true });
}
