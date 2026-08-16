import { createHash } from "node:crypto";
import { readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, resolve } from "node:path";

function flag(name) {
  const index = process.argv.indexOf(`--${name}`);
  if (index < 0 || !process.argv[index + 1]) throw new Error(`missing --${name}`);
  return process.argv[index + 1];
}

const asset = resolve(flag("asset"));
const tagVersion = flag("version").replace(/^v/, "");
const output = resolve(flag("out"));
const repository = process.argv.includes("--repo") ? flag("repo") : "brofea/oh-my-algo-coach";
const packageJson = JSON.parse(readFileSync(resolve(import.meta.dirname, "..", "packages", "cli", "package.json"), "utf8"));
if (!statSync(asset).isFile()) throw new Error(`asset is not a file: ${asset}`);
const tagMatch = /^(\d+)\.(\d+)$/.exec(tagVersion);
if (!tagMatch) throw new Error(`release version must use major.minor format, received ${tagVersion}`);
const packageMatch = /^(\d+)\.(\d+)\.(\d+)$/.exec(packageJson.version);
if (!packageMatch || packageMatch[1] !== tagMatch[1] || packageMatch[2] !== tagMatch[2]) {
  throw new Error(`package version ${packageJson.version} does not match release tag v${tagVersion}`);
}

const sha256 = createHash("sha256").update(readFileSync(asset)).digest("hex");
const tag = `v${tagVersion}`;
const manifest = {
  schema_version: 1,
  package_name: packageJson.name,
  version: packageJson.version,
  node_major: 22,
  asset_name: basename(asset),
  asset_url: `https://github.com/${repository}/releases/download/${tag}/${basename(asset)}`,
  sha256,
};
writeFileSync(output, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
