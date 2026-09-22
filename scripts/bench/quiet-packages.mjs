/**
 * Token packages for the quiet benchmark.
 *
 * Several benchmark repositories keep their spacing scale in an npm package a
 * sparse checkout cannot see (Primer's --base-size-* in @primer/primitives,
 * Carbon's $spacing-* in @carbon/layout, AdminLTE's $spacers from bootstrap).
 * A manifest row names the package and a pinned version under `tokenPackages`;
 * the bench installs every named package once, into benchmarks/quiet/packages,
 * with scripts disabled, and passes the files the allowlist in
 * src/core/token-packages.json lists for that package to the audit as explicit
 * token sources. Explicit sources win over scanned stylesheets, which is what
 * the maintainers who named the package asked for.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const TOKEN_PACKAGES = require('../../src/core/token-packages.json').packages;

export const REGISTRY = 'https://registry.npmjs.org';

/** One pinned entry per package name across the manifest; two rows must agree on the version. */
export function packageManifest(repos) {
  const pinned = new Map();
  for (const repo of repos) {
    for (const entry of repo.tokenPackages || []) {
      if (!entry || typeof entry.name !== 'string' || typeof entry.version !== 'string') {
        throw new Error(`${repo.name}: tokenPackages entries need a name and a pinned version`);
      }
      if (!TOKEN_PACKAGES.some((known) => known.name === entry.name)) {
        throw new Error(`${repo.name}: ${entry.name} is not in src/core/token-packages.json; add it there first`);
      }
      const existing = pinned.get(entry.name);
      if (existing && existing !== entry.version) {
        throw new Error(`${entry.name} is pinned to ${existing} and ${entry.version}; one version per package`);
      }
      pinned.set(entry.name, entry.version);
    }
  }
  return Object.fromEntries([...pinned.entries()].sort(([a], [b]) => a.localeCompare(b)));
}

function installedVersion(packagesDir, name) {
  try {
    return JSON.parse(fs.readFileSync(path.join(packagesDir, 'node_modules', name, 'package.json'), 'utf8')).version;
  } catch {
    return null;
  }
}

/**
 * Installs the pinned packages unless every one is already present at its
 * version. `run(cmd, args, options)` is injectable so tests never touch npm.
 */
export function installTokenPackages(repos, packagesDir, { run, installed = installedVersion } = {}) {
  const wanted = packageManifest(repos);
  const names = Object.keys(wanted);
  if (names.length === 0) return { installed: [], skipped: true };
  const missing = names.filter((name) => installed(packagesDir, name) !== wanted[name]);
  if (missing.length === 0) return { installed: names, skipped: true };

  fs.mkdirSync(packagesDir, { recursive: true });
  fs.writeFileSync(
    path.join(packagesDir, 'package.json'),
    `${JSON.stringify({ name: 'rhythmguard-quiet-benchmark-packages', private: true, devDependencies: wanted }, null, 2)}\n`,
  );
  run('npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund', '--no-package-lock', '--registry', REGISTRY], { cwd: packagesDir });
  return { installed: names, skipped: false };
}

/**
 * The audit token sources for one repository: the allowlisted files of each
 * package it names, resolved under packagesDir. Missing files are an error,
 * because a silent fallback would put the row back on the default scale.
 */
export function tokenSourcesFor(repo, packagesDir, { exists = fs.existsSync } = {}) {
  const sources = [];
  for (const entry of repo.tokenPackages || []) {
    const known = TOKEN_PACKAGES.find((candidate) => candidate.name === entry.name);
    if (!known) throw new Error(`${repo.name}: ${entry.name} is not in src/core/token-packages.json`);
    for (const file of known.files) {
      const resolved = path.join(packagesDir, 'node_modules', entry.name, file);
      if (!exists(resolved)) {
        throw new Error(`${repo.name}: ${entry.name}@${entry.version} does not ship ${file}; fix the allowlist or the pin`);
      }
      sources.push({
        format: 'auto',
        package: entry.name,
        path: resolved,
        version: entry.version,
        ...(known.tokenPattern ? { tokenPattern: known.tokenPattern } : {}),
      });
    }
  }
  return sources;
}

/** `name@version` for each package a row names, for reports. */
export function describeTokenPackages(repo) {
  return (repo.tokenPackages || []).map((entry) => `${entry.name}@${entry.version}`);
}
