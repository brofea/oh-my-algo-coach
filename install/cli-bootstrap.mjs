#!/usr/bin/env node

import { createHash, randomUUID } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, extname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_REPOSITORY = "brofea/oh-my-algo-coach";
const EXPECTED_PACKAGE_NAME = "@omac/cli";
const MIN_NODE_MAJOR = 22;

function parseFlags(args) {
  const flags = new Map();
  const positional = [];
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (!arg.startsWith("--")) {
      positional.push(arg);
      continue;
    }
    const equal = arg.indexOf("=");
    if (equal >= 0) {
      flags.set(arg.slice(2, equal), arg.slice(equal + 1));
      continue;
    }
    const next = args[i + 1];
    if (next && !next.startsWith("-")) {
      flags.set(arg.slice(2), next);
      i += 1;
    } else {
      flags.set(arg.slice(2), true);
    }
  }
  return { flags, positional };
}

function flag(flags, name, fallback) {
  const value = flags.get(name);
  return typeof value === "string" ? value : fallback;
}

function flagBool(flags, name) {
  const value = flags.get(name);
  return value === true || value === "true" || value === "1" || value === "yes";
}

function output(value) {
  process.stdout.write(`${JSON.stringify(value)}\n`);
}

function fail(code, message) {
  process.stderr.write(`${JSON.stringify({ error: { code, message } })}\n`);
  process.exitCode = 1;
}

function ensureNode() {
  const major = currentNodeMajor();
  if (!Number.isFinite(major) || major < MIN_NODE_MAJOR) {
    throw new Error(`OMAC CLI requires Node.js >= ${MIN_NODE_MAJOR}; found ${process.versions.node}`);
  }
}

function currentNodeMajor() {
  return Number.parseInt(process.versions.node.split(".")[0], 10);
}

function projectRoot(flags) {
  const requested = flag(flags, "root");
  if (requested) return resolve(requested);
  return process.cwd();
}

function installDir(root, flags) {
  const requested = flag(flags, "install-dir", ".agents/cli");
  return isAbsolute(requested) ? requested : resolve(root, requested);
}

function packagePath(packageName) {
  const parts = packageName.split("/");
  return parts[0].startsWith("@") ? join("node_modules", parts[0], parts[1]) : join("node_modules", packageName);
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function writeJsonAtomic(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  const temp = `${path}.tmp-${randomUUID()}`;
  writeFileSync(temp, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  renameSync(temp, path);
}

function asUrl(value) {
  try {
    return new URL(value);
  } catch {
    return undefined;
  }
}

async function readResource(resource, baseDir) {
  const url = asUrl(resource);
  if (!url) return readFileSync(isAbsolute(resource) ? resource : resolve(baseDir, resource), "utf8");
  if (url.protocol === "file:") return readFileSync(fileURLToPath(url), "utf8");
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error(`unsupported resource protocol: ${url.protocol}`);
  const response = await fetch(url, { headers: { "user-agent": "omac-cli-bootstrap" } });
  if (!response.ok) throw new Error(`download failed (${response.status}) for ${url}`);
  return await response.text();
}

async function downloadResource(resource, destination, baseDir) {
  const url = asUrl(resource);
  mkdirSync(dirname(destination), { recursive: true });
  if (!url) {
    copyFileSync(isAbsolute(resource) ? resource : resolve(baseDir, resource), destination);
    return;
  }
  if (url.protocol === "file:") {
    copyFileSync(fileURLToPath(url), destination);
    return;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error(`unsupported resource protocol: ${url.protocol}`);
  const response = await fetch(url, { headers: { "user-agent": "omac-cli-bootstrap" } });
  if (!response.ok) throw new Error(`download failed (${response.status}) for ${url}`);
  writeFileSync(destination, Buffer.from(await response.arrayBuffer()));
}

function sha256File(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function normalizeVersion(version) {
  return version.startsWith("v") ? version.slice(1) : version;
}

function releaseTag(version) {
  const normalized = normalizeVersion(version);
  const match = /^(\d+)\.(\d+)(?:\.\d+)?$/.exec(normalized);
  if (!match) throw new Error(`CLI release version must use major.minor format, received ${version}`);
  return `v${match[1]}.${match[2]}`;
}

async function resolveManifest(flags, root) {
  const explicitManifest = flag(flags, "manifest");
  if (explicitManifest) {
    const manifest = JSON.parse(await readResource(explicitManifest, root));
    return { manifest, source: explicitManifest };
  }

  const repository = flag(flags, "repo", process.env.OMAC_GITHUB_REPO ?? DEFAULT_REPOSITORY);
  const requestedVersion = flag(flags, "version", "latest");
  let version = requestedVersion;
  if (requestedVersion === "latest") {
    const releaseUrl = `https://api.github.com/repos/${repository}/releases/latest`;
    const release = JSON.parse(await readResource(releaseUrl, root));
    version = release.tag_name;
    if (!version) throw new Error(`GitHub latest release for ${repository} has no tag_name`);
  }
  const tag = releaseTag(version);
  const manifestUrl = `https://github.com/${repository}/releases/download/${tag}/manifest.json`;
  const manifest = JSON.parse(await readResource(manifestUrl, root));
  return { manifest, source: manifestUrl };
}

function validateManifest(manifest) {
  if (!manifest || manifest.schema_version !== 1) throw new Error("CLI release manifest schema_version must be 1");
  if (manifest.package_name !== EXPECTED_PACKAGE_NAME) {
    throw new Error(`CLI release manifest package_name must be ${EXPECTED_PACKAGE_NAME}`);
  }
  if (typeof manifest.version !== "string" || !manifest.version || !manifest.asset_url || !manifest.sha256) {
    throw new Error("CLI release manifest requires package_name, version, asset_url and sha256");
  }
  if (typeof manifest.asset_url !== "string" || typeof manifest.sha256 !== "string") {
    throw new Error("CLI release manifest asset_url and sha256 must be strings");
  }
  if (!/^[0-9a-f]{64}$/i.test(manifest.sha256)) throw new Error("CLI release manifest sha256 must be a 64-character hex digest");
  const requiredNodeMajor = manifest.node_major === undefined ? MIN_NODE_MAJOR : Number(manifest.node_major);
  if (!Number.isInteger(requiredNodeMajor) || requiredNodeMajor < MIN_NODE_MAJOR) {
    throw new Error(`CLI release manifest node_major must be an integer >= ${MIN_NODE_MAJOR}`);
  }
  if (currentNodeMajor() < requiredNodeMajor) {
    throw new Error(`CLI release requires Node.js >= ${requiredNodeMajor}; found ${process.versions.node}`);
  }
  if (manifest.version.includes("/") || manifest.version.includes("\\")) throw new Error("CLI release version cannot contain path separators");
  if (!normalizeVersion(manifest.version)) throw new Error("CLI release manifest version cannot be empty");
}

function readCurrent(path) {
  if (!existsSync(path)) return undefined;
  try {
    return readJson(path);
  } catch {
    return undefined;
  }
}

function packageEntry(installRoot, current) {
  return join(installRoot, "versions", current.version_dir, packagePath(current.package_name), "dist", "index.js");
}

function npmExecutable() {
  return process.platform === "win32" ? "npm.cmd" : "npm";
}

function installPackage(assetPath, stageDir, root) {
  const args = ["install", "--prefix", stageDir, "--no-save", "--package-lock=false", "--ignore-scripts", assetPath];
  try {
    execFileSync(npmExecutable(), args, {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, npm_config_update_notifier: "false", npm_config_fund: "false", npm_config_audit: "false" },
    });
  } catch (error) {
    const detail = error?.stderr?.toString?.().trim() || error?.message || String(error);
    throw new Error(`npm install failed: ${detail}`);
  }
}

async function install(flags) {
  ensureNode();
  const root = projectRoot(flags);
  const targetRoot = installDir(root, flags);
  const currentPath = join(targetRoot, "current.json");
  const { manifest, source } = await resolveManifest(flags, root);
  validateManifest(manifest);
  const packageName = manifest.package_name;
  const current = readCurrent(currentPath);
  if (current?.package_name === packageName && current.version === manifest.version && current.sha256.toLowerCase() === manifest.sha256.toLowerCase() && existsSync(packageEntry(targetRoot, current))) {
    return { ok: true, status: "already_installed", current };
  }

  const stagingDir = join(targetRoot, `.staging-${randomUUID()}`);
  const assetResource = flag(flags, "asset", manifest.asset_url);
  const downloadPath = join(targetRoot, `.download-${randomUUID()}${extname(assetResource) || ".tgz"}`);
  const versionDir = `${normalizeVersion(manifest.version).replace(/[^a-zA-Z0-9._-]/g, "_")}-${manifest.sha256.slice(0, 12)}`;
  const finalVersionDir = join(targetRoot, "versions", versionDir);
  try {
    mkdirSync(targetRoot, { recursive: true });
    const assetUrl = asUrl(assetResource) ? assetResource : asUrl(source) ? new URL(assetResource, source).toString() : assetResource;
    await downloadResource(assetUrl, downloadPath, root);
    const actualHash = sha256File(downloadPath);
    if (actualHash.toLowerCase() !== manifest.sha256.toLowerCase()) {
      throw new Error(`CLI asset checksum mismatch: expected ${manifest.sha256}, got ${actualHash}`);
    }
    installPackage(downloadPath, stagingDir, root);
    const stagedEntry = join(stagingDir, packagePath(packageName), "dist", "index.js");
    if (!existsSync(stagedEntry) || !statSync(stagedEntry).isFile()) throw new Error(`installed package is missing ${packageName}/dist/index.js`);
    mkdirSync(join(targetRoot, "versions"), { recursive: true });
    if (existsSync(finalVersionDir)) rmSync(finalVersionDir, { recursive: true, force: true });
    renameSync(stagingDir, finalVersionDir);
    const next = {
      schema_version: 1,
      package_name: packageName,
      version: manifest.version,
      version_dir: versionDir,
      asset_url: manifest.asset_url,
      sha256: manifest.sha256.toLowerCase(),
      source,
      installed_at: new Date().toISOString(),
    };
    writeJsonAtomic(currentPath, next);
    return { ok: true, status: current ? "updated" : "installed", current: next, previous: current };
  } finally {
    rmSync(stagingDir, { recursive: true, force: true });
    rmSync(downloadPath, { force: true });
  }
}

function status(flags) {
  const root = projectRoot(flags);
  const targetRoot = installDir(root, flags);
  const currentPath = join(targetRoot, "current.json");
  const current = readCurrent(currentPath);
  if (!current) return { ok: true, installed: false, install_dir: targetRoot };
  return { ok: true, installed: existsSync(packageEntry(targetRoot, current)), install_dir: targetRoot, current };
}

function run(flags, args) {
  ensureNode();
  const root = projectRoot(flags);
  const targetRoot = installDir(root, flags);
  const current = readCurrent(join(targetRoot, "current.json"));
  if (!current) throw new Error(`OMAC CLI is not installed in ${targetRoot}; run install first`);
  const entry = packageEntry(targetRoot, current);
  if (!existsSync(entry)) throw new Error(`installed OMAC CLI entrypoint is missing: ${entry}`);
  const result = spawnSync(process.execPath, [entry, ...args], { cwd: root, stdio: "inherit" });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
}

async function main() {
  const [command = "status", ...args] = process.argv.slice(2);
  if (command === "run") {
    run(new Map(), args);
    return;
  }
  const { flags } = parseFlags(args);
  if (command === "install" || command === "update") {
    output(await install(flags));
    return;
  }
  if (command === "status") {
    output(status(flags));
    return;
  }
  throw new Error(`unknown bootstrap command '${command}'; expected install, update, run or status`);
}

main().catch((error) => fail("bootstrap_failed", error instanceof Error ? error.message : String(error)));
