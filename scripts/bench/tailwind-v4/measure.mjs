#!/usr/bin/env node
/**
 * Tailwind v4 apps: the Phase 0 measurement, exactly as pre-registered in
 * benchmarks/tailwind-v4/README.md. Clones each sample app at its pinned
 * commit, reads every string in its TSX/JSX, and counts spacing classes off the
 * app's reference scale. Independent of the shipped rules on purpose: it
 * measures the definitions, not the current implementation.
 *
 *   node scripts/bench/tailwind-v4/measure.mjs            # clone, measure, write findings.json and the summary
 *   node scripts/bench/tailwind-v4/measure.mjs --no-clone # reuse checkouts
 *   node scripts/bench/tailwind-v4/measure.mjs --only plane,langfuse
 */

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..', '..');
const benchDir = path.join(repoRoot, 'benchmarks', 'tailwind-v4');
const reposDir = path.join(benchDir, 'repos');
const packagesDir = path.join(benchDir, 'packages');
const require = createRequire(import.meta.url);
const { parseLengthToken, toPx } = require(path.join(repoRoot, 'src', 'core', 'length.js'));

const ROOT_PX = 16;
// Tailwind v3's step names, which v4's documentation still lists (README, "Reference scale").
const DEFAULT_STEPS = [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 5, 6, 7, 8, 9, 10, 11, 12, 14, 16, 20, 24, 28, 32, 36, 40, 44, 48, 52, 56, 60, 64, 72, 80, 96];
const RHYTHM = /^(?<neg>-?)(?<utility>p[xytrblse]?|m[xytrblse]?|gap(?:-[xy])?|space-[xy])-(?<value>.+)$/;
const POSITION = /^(?<neg>-?)(?<utility>inset(?:-[xy])?|top|right|bottom|left|start|end|translate-[xy])-(?<value>.+)$/;
const STEP = /^\d+(?:\.\d+)?$/;
const SKIP_DIR = /(^|\/)(node_modules|dist|build|\.next|out|coverage|__tests__|tests?|e2e)(\/|$)/;
const SKIP_FILE = /\.(test|spec|stories)\.[jt]sx$/;

function parseArgs(argv) {
  const args = { clone: true, only: null };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--no-clone') args.clone = false;
    else if (argv[i] === '--only') args.only = new Set(String(argv[++i] || '').split(',').filter(Boolean));
  }
  return args;
}

function run(cmd, cmdArgs, options = {}) {
  const result = spawnSync(cmd, cmdArgs, { encoding: 'utf8', maxBuffer: 1 << 28, stdio: 'pipe', ...options });
  if (result.status !== 0) throw new Error(`${cmd} ${cmdArgs.join(' ')} failed:\n${result.stderr || result.stdout}`);
  return result.stdout;
}

function loadTypeScript() {
  if (!fs.existsSync(path.join(packagesDir, 'node_modules', 'typescript'))) {
    run('npm', ['ci', '--no-audit', '--no-fund', '--registry', 'https://registry.npmjs.org'], { cwd: packagesDir });
  }
  return require(path.join(packagesDir, 'node_modules', 'typescript'));
}

/** Sparse checkout: the app directory, plus every CSS and package.json file for the theme. */
function checkout(app) {
  const dir = path.join(reposDir, app.name);
  if (!fs.existsSync(path.join(dir, '.git'))) {
    fs.mkdirSync(reposDir, { recursive: true });
    run('git', ['clone', '--depth', '1', '--filter=blob:none', '--sparse', '--quiet', app.url, dir]);
  }
  run('git', ['-C', dir, 'fetch', '--depth', '1', '--quiet', 'origin', app.commit]);
  run('git', ['-C', dir, 'checkout', '--detach', '--quiet', 'FETCH_HEAD']);
  const appPattern = app.app === '.' ? '/*' : `/${app.app}/`;
  run('git', ['-C', dir, 'sparse-checkout', 'set', '--no-cone', appPattern, '*.css', 'package.json']);
  return dir;
}

function walk(dir, predicate, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === '.git' || entry.name === 'node_modules') continue;
      walk(full, predicate, out);
    } else if (predicate(full)) {
      out.push(full);
    }
  }
  return out;
}

/** The bodies of `@theme { ... }` blocks, braces matched (a block can hold `@keyframes`). */
function themeBlocks(css) {
  const blocks = [];
  for (const match of css.matchAll(/@theme\b[^{;]*\{/g)) {
    let depth = 1;
    let i = match.index + match[0].length;
    const start = i;
    for (; i < css.length && depth > 0; i += 1) {
      if (css[i] === '{') depth += 1;
      else if (css[i] === '}') depth -= 1;
    }
    blocks.push(css.slice(start, i - 1));
  }
  return blocks;
}

/**
 * Theme: `@theme` blocks in CSS under the app directory and under the
 * workspace packages the app depends on. `--spacing` sets the base;
 * `--spacing-<name>` adds a named step.
 */
function readTheme(checkoutDir, appDir) {
  const pkgDirs = new Map();
  for (const file of walk(checkoutDir, (f) => path.basename(f) === 'package.json')) {
    try {
      const { name } = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (name) pkgDirs.set(name, path.dirname(file));
    } catch { /* not JSON */ }
  }
  const appPkg = JSON.parse(fs.readFileSync(path.join(appDir, 'package.json'), 'utf8'));
  const roots = [appDir];
  for (const dep of Object.keys({ ...appPkg.dependencies, ...appPkg.devDependencies })) {
    if (pkgDirs.has(dep)) roots.push(pkgDirs.get(dep));
  }
  let base = null;
  const named = new Map();
  const sources = [];
  for (const root of [...new Set(roots)]) {
    for (const file of walk(root, (f) => f.endsWith('.css') && !SKIP_DIR.test(path.relative(checkoutDir, f)))) {
      const css = fs.readFileSync(file, 'utf8');
      for (const block of themeBlocks(css)) {
        for (const decl of block.matchAll(/--spacing(?:-(?<name>[\w.-]+))?\s*:\s*(?<value>[^;]+);/g)) {
          const length = parseLengthToken(decl.groups.value.trim());
          if (!length) continue;
          const px = toPx(length.number, length.unit || 'px', ROOT_PX);
          if (px === null) continue;
          if (decl.groups.name) named.set(decl.groups.name, px);
          else base = px;
          sources.push(path.relative(checkoutDir, file));
        }
      }
    }
  }
  const basePx = base ?? 4;
  const scale = new Set(DEFAULT_STEPS.map((step) => step * basePx));
  for (const px of named.values()) scale.add(px);
  return {
    basePx,
    declared: base !== null && base !== 4 ? true : named.size > 0,
    named: Object.fromEntries(named),
    scale: [...scale].sort((a, b) => a - b),
    sources: [...new Set(sources)],
  };
}

const CLASS_ATTRIBUTE = /^(class|className|\w+ClassName|classNames?|classes)$/;
const CLASS_HELPER = /^(cn|clsx|cx|cva|tv|twMerge|twJoin|classnames|classNames)$/;
const GEOMETRY_ATTRIBUTE = /^(d|points|viewBox|transform|path)$/;
const PATH_DATA = /^[MmLlHhVvCcSsQqTtAaZz\d\s.,+-]+$/;

/** Where a string sits: a class attribute, a class helper's argument, or SVG geometry (amendment 1). */
function stringContext(ts, node) {
  for (let current = node.parent; current; current = current.parent) {
    if (ts.isJsxAttribute(current)) {
      const name = current.name.getText();
      if (GEOMETRY_ATTRIBUTE.test(name)) return 'geometry';
      return CLASS_ATTRIBUTE.test(name) ? 'class' : 'other';
    }
    if (ts.isCallExpression(current)) {
      const callee = current.expression;
      const name = ts.isIdentifier(callee) ? callee.text : ts.isPropertyAccessExpression(callee) ? callee.name.text : '';
      if (CLASS_HELPER.test(name)) return 'class';
    }
    if (ts.isStatement(current) || ts.isFunctionLike(current)) return 'other';
  }
  return 'other';
}

function strings(ts, file) {
  const text = fs.readFileSync(file, 'utf8');
  const kind = file.endsWith('.jsx') ? ts.ScriptKind.JSX : ts.ScriptKind.TSX;
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, kind);
  const out = [];
  const visit = (node) => {
    if (
      ts.isStringLiteral(node) ||
      ts.isNoSubstitutionTemplateLiteral(node) ||
      node.kind === ts.SyntaxKind.TemplateHead ||
      node.kind === ts.SyntaxKind.TemplateMiddle ||
      node.kind === ts.SyntaxKind.TemplateTail
    ) {
      out.push({
        context: stringContext(ts, node),
        line: source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1,
        text: node.text,
      });
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return out;
}

/**
 * Amendment 1 (2026-11-01, after the first run): SVG path data and lone
 * identifiers are not class lists. `d="... c-184 ..."` read as margins, and a
 * branch id `'pr-482'` read as padding. A finding counts under the amended
 * definition unless its string is geometry or path data, and a step finding
 * also needs a class context or a string of two or more tokens.
 */
function amendedCounts(finding) {
  if (finding.context === 'geometry' || finding.pathData) return false;
  if (finding.form === 'step' && finding.context !== 'class' && finding.tokens < 2) return false;
  return true;
}

/** The last `:` outside brackets ends the variant prefix; `!` may lead or trail. */
function utilityOf(token) {
  let depth = 0;
  let cut = -1;
  for (let i = 0; i < token.length; i += 1) {
    if (token[i] === '[' || token[i] === '(') depth += 1;
    else if ((token[i] === ']' || token[i] === ')') && depth > 0) depth -= 1;
    else if (token[i] === ':' && depth === 0) cut = i;
  }
  return token.slice(cut + 1).replace(/^!|!$/g, '');
}

function classify(token, theme) {
  const candidate = utilityOf(token);
  let group = 'rhythm';
  let match = candidate.match(RHYTHM);
  if (!match) {
    match = candidate.match(POSITION);
    group = 'position';
  }
  if (!match) return null;
  const { value } = match.groups;
  let px;
  let form;
  if (value.startsWith('[') && value.endsWith(']')) {
    const length = parseLengthToken(value.slice(1, -1));
    if (!length || !['px', 'rem', 'em'].includes(length.unit)) return null;
    px = Math.abs(toPx(length.number, length.unit, ROOT_PX));
    form = 'bracketed';
  } else if (STEP.test(value)) {
    const step = Number(value);
    // v4 generates quarter steps only; anything else is not a class.
    if (Math.abs(step * 4 - Math.round(step * 4)) > 1e-9) return null;
    px = step * theme.basePx;
    form = 'step';
  } else {
    return null;
  }
  if (px === 0 || px <= 1) return null;
  const onScale = theme.scale.some((step) => Math.abs(step - px) < 0.01);
  if (onScale && form === 'step') return null;
  const below = theme.scale.filter((step) => step < px).pop();
  const above = theme.scale.find((step) => step > px);
  return {
    form,
    group,
    nearest: [below, above].filter((v) => v !== undefined),
    onScale,
    px: Math.round(px * 100) / 100,
    token,
    utility: match.groups.utility,
  };
}

function measureApp(ts, app, checkoutDir) {
  const appDir = app.app === '.' ? checkoutDir : path.join(checkoutDir, app.app);
  const theme = readTheme(checkoutDir, appDir);
  const files = walk(appDir, (f) => /\.[jt]sx$/.test(f) && !SKIP_FILE.test(f) && !SKIP_DIR.test(path.relative(appDir, f)));
  const findings = [];
  let parseErrors = 0;
  for (const file of files) {
    let list;
    try {
      list = strings(ts, file);
    } catch {
      parseErrors += 1;
      continue;
    }
    const rel = path.relative(appDir, file);
    const copied = /(^|\/)components\/ui\//.test(rel);
    for (const { context, line, text } of list) {
      const tokens = text.split(/\s+/).filter(Boolean);
      const pathData = PATH_DATA.test(text) && (text.match(/\d+/g) || []).length >= 3;
      for (const token of tokens) {
        const hit = classify(token, theme);
        if (!hit) continue;
        const finding = { ...hit, context, copied, file: rel, line, pathData, tokens: tokens.length };
        finding.amended = amendedCounts(finding);
        findings.push(finding);
      }
    }
  }
  return { files: files.length, findings, parseErrors, theme };
}

function summarize(app, result) {
  const original = result.findings.filter((f) => !f.copied && !f.onScale && f.group === 'rhythm');
  const eligible = result.findings.filter((f) => !f.copied && !f.onScale && f.amended);
  const rhythm = eligible.filter((f) => f.group === 'rhythm');
  return {
    app: app.app,
    bracketed: rhythm.filter((f) => f.form === 'bracketed').length,
    rhythmOriginal: original.length,
    commit: app.commit.slice(0, 7),
    copiedOffScale: result.findings.filter((f) => f.copied && !f.onScale && f.group === 'rhythm').length,
    declared: result.theme.declared,
    exactEquivalent: result.findings.filter((f) => f.onScale && !f.copied).length,
    files: result.files,
    name: app.name,
    parseErrors: result.parseErrors,
    per100Files: result.files ? Math.round((rhythm.length / result.files) * 1000) / 10 : 0,
    position: eligible.filter((f) => f.group === 'position').length,
    repo: app.repo,
    rhythm: rhythm.length,
    step: rhythm.filter((f) => f.form === 'step').length,
    themeSources: result.theme.sources,
  };
}

const args = parseArgs(process.argv.slice(2));
const apps = JSON.parse(fs.readFileSync(path.join(benchDir, 'apps.json'), 'utf8'))
  .filter((app) => app.role === 'sample' && (!args.only || args.only.has(app.name)));
const ts = loadTypeScript();
const resultsDir = path.join(benchDir, 'results');
fs.mkdirSync(resultsDir, { recursive: true });
const summaries = [];
for (const app of apps) {
  const dir = args.clone ? checkout(app) : path.join(reposDir, app.name);
  const result = measureApp(ts, app, dir);
  fs.writeFileSync(path.join(resultsDir, `${app.name}.json`), `${JSON.stringify({ ...result, app }, null, 2)}\n`);
  const summary = summarize(app, result);
  summaries.push(summary);
  console.error(`${app.name}: ${summary.files} files, ${summary.rhythm} rhythm findings (${summary.bracketed} bracketed, ${summary.step} step; ${summary.rhythmOriginal} before amendment 1), declared=${summary.declared}`);
}
if (!args.only) {
  fs.writeFileSync(path.join(benchDir, 'summary.json'), `${JSON.stringify(summaries, null, 2)}\n`);
}
const withDrift = summaries.filter((s) => s.rhythm > 0).length;
const withDriftOriginal = summaries.filter((s) => s.rhythmOriginal > 0).length;
console.log(`${withDrift} of ${summaries.length} apps have one or more off-scale rhythm findings outside components/ui/ (${withDriftOriginal} before amendment 1).`);
