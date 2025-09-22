import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const version = process.argv[2];
if (!version) {
  console.error("Usage: node scripts/bump-userscript.js <version>");
  process.exitCode = 1;
  process.exit();
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const metadataPath = resolve(__dirname, "..", "src", "metadata.txt");

let metadata;
try {
  metadata = readFileSync(metadataPath, "utf8");
} catch (error) {
  console.error("Failed to read metadata file:", error);
  process.exitCode = 1;
  process.exit();
}

const updated = metadata.replace(/(^\s*\/\/\s*@version\s+).*/m, `$1${version}`);
if (updated === metadata) {
  console.warn("No @version line updated in metadata.txt; check the file format.");
}

try {
  writeFileSync(metadataPath, updated, "utf8");
  console.log(`Updated metadata version to ${version}`);
} catch (error) {
  console.error("Failed to write metadata file:", error);
  process.exitCode = 1;
  process.exit();
}
