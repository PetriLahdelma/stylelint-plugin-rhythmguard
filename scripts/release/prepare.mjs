#!/usr/bin/env node
/**
 * Prepares a release on the current branch, replacing the hand edits that used
 * to live in docs/RELEASE_CHECKLIST.md sections 2 and 3:
 *
 *   - the version in package.json, package-lock.json (root and packages[""]) and
 *     both packages/<name>/package.json, and their ^range on the plugin
 *   - the README npm badge cache-buster (r=XYZ)
 *   - CHANGELOG.md: [Unreleased] becomes [X.Y.Z] - date, with an empty
 *     [Unreleased] above it, and the section is written to the notes file
 *   - the local gate: lint, typecheck, tests, the Stylelint floor, the playground
 *     bundle (must be committed fresh) and the pack smoke on the public registry
 *
 * It refuses a version that is not above the current one, an empty
 * [Unreleased] section, and a release within 24 hours of the last one on npm
 * (seven versions in four days read as churn; council Amendment 2). It does
 * not commit, tag or publish: the release PR and `gh release create` stay
 * explicit steps.
 *
 *   node scripts/release/prepare.mjs 3.19.0
 *   node scripts/release/prepare.mjs 3.19.0 --date 2026-11-27 --notes /tmp/notes.md
 *   node scripts/release/prepare.mjs 3.19.0 --no-gate          # edits only
 *   node scripts/release/prepare.mjs 3.19.0 --allow-within-24h  # a fix for a broken release
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const REGISTRY = 'https://registry.npmjs.org';
const COMPANIONS = ['packages/rhythmguard', 'packages/eslint-plugin-rhythmguard'];
const DAY_MS = 24 * 60 * 60 * 1000;

export function parseVersion(version) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(String(version));
  if (!match) throw new Error(`Not a release version: ${version} (expected X.Y.Z)`);
  return match.slice(1).map(Number);
}

export function isAbove(next, current) {
  const a = parseVersion(next);
  const b = parseVersion(current);
  for (let i = 0; i < 3; i += 1) if (a[i] !== b[i]) return a[i] > b[i];
  return false;
}

/** The README badge's cache-buster: 3.18.0 -> 3180, 3.10.2 -> 3102. */
export function badgeKey(version) {
  return parseVersion(version).join('');
}

/** Moves the [Unreleased] body under a dated heading and returns the new text and the notes. */
export function cutChangelog(text, version, date) {
  const heading = '## [Unreleased]';
  const start = text.indexOf(heading);
  if (start === -1) throw new Error('CHANGELOG.md has no ## [Unreleased] heading');
  const bodyStart = start + heading.length;
  const next = text.indexOf('\n## [', bodyStart);
  const body = text.slice(bodyStart, next === -1 ? text.length : next).trim();
  if (!body) throw new Error('The [Unreleased] section is empty; nothing to release');
  if (text.includes(`## [${version}]`)) throw new Error(`CHANGELOG.md already has a ${version} section`);
  const rest = next === -1 ? '' : text.slice(next);
  const updated = `${text.slice(0, start)}${heading}\n\n## [${version}] - ${date}\n\n${body}\n${rest}`;
  return { notes: `${body}\n`, text: updated };
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function writeJson(file, value) {
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

function run(cmd, args, options = {}) {
  console.log(`$ ${[cmd, ...args].join(' ')}`);
  const result = spawnSync(cmd, args, { stdio: 'inherit', ...options });
  if (result.status !== 0) throw new Error(`${cmd} ${args.join(' ')} exited ${result.status}`);
}

function lastPublished(pkg) {
  const json = execFileSync('npm', ['view', pkg, 'time', '--json', '--registry', REGISTRY], { encoding: 'utf8' });
  const times = JSON.parse(json);
  const versions = Object.entries(times).filter(([key]) => /^\d+\.\d+\.\d+$/.test(key));
  versions.sort((a, b) => Date.parse(b[1]) - Date.parse(a[1]));
  return versions[0] ? { version: versions[0][0], at: new Date(versions[0][1]) } : null;
}

function parseArgs(argv) {
  const args = { gate: true, within24h: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--no-gate') args.gate = false;
    else if (arg === '--allow-within-24h') args.within24h = true;
    else if (arg === '--date') args.date = argv[(i += 1)];
    else if (arg === '--notes') args.notes = argv[(i += 1)];
    else if (!arg.startsWith('--') && !args.version) args.version = arg;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!args.version) throw new Error('Usage: node scripts/release/prepare.mjs <X.Y.Z> [--date YYYY-MM-DD] [--notes file] [--no-gate] [--allow-within-24h]');
  return args;
}

export function prepare(root, { version, date }) {
  const pkgPath = path.join(root, 'package.json');
  const pkg = readJson(pkgPath);
  if (!isAbove(version, pkg.version)) throw new Error(`${version} is not above the current ${pkg.version}`);
  const previous = pkg.version;

  pkg.version = version;
  writeJson(pkgPath, pkg);

  const lockPath = path.join(root, 'package-lock.json');
  const lock = readJson(lockPath);
  lock.version = version;
  lock.packages[''].version = version;
  writeJson(lockPath, lock);

  for (const dir of COMPANIONS) {
    const file = path.join(root, dir, 'package.json');
    const companion = readJson(file);
    companion.version = version;
    if (companion.dependencies?.[pkg.name]) companion.dependencies[pkg.name] = `^${version}`;
    writeJson(file, companion);
  }

  const readmePath = path.join(root, 'README.md');
  const readme = fs.readFileSync(readmePath, 'utf8');
  const badge = `r=${badgeKey(previous)})`;
  if (!readme.includes(badge)) throw new Error(`README.md has no npm badge with ${badge}`);
  fs.writeFileSync(readmePath, readme.replace(badge, `r=${badgeKey(version)})`));

  const changelogPath = path.join(root, 'CHANGELOG.md');
  const { notes, text } = cutChangelog(fs.readFileSync(changelogPath, 'utf8'), version, date);
  fs.writeFileSync(changelogPath, text);
  return { notes, previous };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
  const args = parseArgs(process.argv.slice(2));
  const date = args.date || new Date().toISOString().slice(0, 10);
  const name = readJson(path.join(root, 'package.json')).name;

  const last = lastPublished(name);
  if (last && !args.within24h && Date.now() - last.at.getTime() < DAY_MS) {
    const hours = Math.round((Date.now() - last.at.getTime()) / 3600000);
    throw new Error(`${name}@${last.version} was published ${hours} h ago; wait 24 hours between releases, or pass --allow-within-24h for a fix to a broken release`);
  }

  const { notes, previous } = prepare(root, { version: args.version, date });
  const notesPath = args.notes || path.join(root, '.release-notes.md');
  fs.writeFileSync(notesPath, notes);
  console.log(`Prepared ${previous} -> ${args.version} (${date}); notes in ${path.relative(root, notesPath) || notesPath}.`);

  if (args.gate) {
    const env = { ...process.env, npm_config_registry: REGISTRY };
    run('npm', ['run', 'lint'], { cwd: root });
    run('npm', ['run', 'typecheck'], { cwd: root });
    run('npm', ['test'], { cwd: root });
    run('npm', ['run', 'test:compat-floor'], { cwd: root });
    run('npm', ['run', 'build:playground'], { cwd: root });
    const stale = execFileSync('git', ['status', '--porcelain', 'docs/playground'], { cwd: root, encoding: 'utf8' }).trim();
    if (stale) throw new Error(`The playground bundle changed when rebuilt; commit it first:\n${stale}`);
    run('npm', ['run', 'test:pack-smoke'], { cwd: root, env });
    console.log('Local gate passed. Next: commit, open the release PR, merge it, then gh release create.');
  }
}
