'use strict';

/**
 * What the quickstart prints and `init` writes, computed once (dx-02, dx-06,
 * tf-06): the audit's own scale inference, the Stylelint config that
 * reproduces it, and the `.rhythmguardrc.json` that makes a bare
 * `rhythmguard audit .` (and an agent) use the same scale.
 */
const fs = require('node:fs');
const path = require('node:path');

const { createAuditReport } = require('../audit/report');

// tokens.json, *.tokens.json, *-tokens.json and the same as CSS (tf-12).
const TOKEN_FILE_PATTERN = /(^|[.-])tokens?\.(json|css)$/i;
// Style Dictionary's CSS output: build/css/variables.css and dist/css/variables.css.
const BUILT_VARIABLES = /^variables\.css$/i;
const TOKEN_DIRS = ['tokens', 'design-tokens', path.join('src', 'tokens'), path.join('dist', 'tokens'), 'src', 'styles', path.join('src', 'styles')];
const BUILT_DIRS = [path.join('build', 'css'), path.join('dist', 'css')];
const TAILWIND_CONFIG_FILES = ['tailwind.config.js', 'tailwind.config.cjs', 'tailwind.config.mjs', 'tailwind.config.ts'];
const RC_FILE = '.rhythmguardrc.json';

function readPackage(cwd) {
  try {
    return JSON.parse(fs.readFileSync(path.join(cwd, 'package.json'), 'utf8'));
  } catch {
    // No readable package.json: no dependencies to read.
    return {};
  }
}

function tailwindMajor(pkg) {
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };
  if (deps['@tailwindcss/postcss'] || deps['@tailwindcss/vite']) {
    return 4;
  }
  const spec = deps.tailwindcss;
  if (!spec) {
    return null;
  }
  const match = String(spec).match(/(\d+)/);
  return match ? Number(match[1]) : null;
}

function findTokenFiles(cwd) {
  const found = new Set();
  const consider = (dir, pattern) => {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      // A directory that does not exist holds no token files.
      return;
    }
    for (const entry of entries) {
      if (entry.isFile() && pattern.test(entry.name)) {
        found.add(path.relative(cwd, path.join(dir, entry.name)));
      }
    }
  };
  consider(cwd, TOKEN_FILE_PATTERN);
  for (const sub of TOKEN_DIRS) {
    consider(path.join(cwd, sub), TOKEN_FILE_PATTERN);
  }
  for (const sub of BUILT_DIRS) {
    consider(path.join(cwd, sub), BUILT_VARIABLES);
  }
  return Array.from(found).sort();
}

/** The Tailwind config at the project root, relative to it, or null. Found, never loaded. */
function findTailwindConfig(cwd) {
  return TAILWIND_CONFIG_FILES.find((file) => fs.existsSync(path.join(cwd, file))) || null;
}

function toPosix(relativePath) {
  return relativePath.startsWith('./') ? relativePath : `./${relativePath.split(path.sep).join('/')}`;
}

/**
 * Run the audit's scale inference on `cwd`, as the quickstart and `init` both
 * do. A Tailwind v3 config is found but not loaded: loading it runs it, which
 * Rhythmguard does only when asked (SECURITY.md). The config this returns
 * names it, so Stylelint reads it once the user pastes or writes that config.
 */
async function inferFirstRun({ cwd = process.cwd(), stack }) {
  const pkg = readPackage(cwd);
  const twMajor = stack.tailwind ? tailwindMajor(pkg) : null;
  const tokenFiles = findTokenFiles(cwd);
  const rcPresent = fs.existsSync(path.join(cwd, RC_FILE));
  const tailwindConfig = stack.tailwind && twMajor !== null && twMajor < 4 ? findTailwindConfig(cwd) : null;
  // With an rc file its token sources are used; otherwise the token files found here.
  const auditTokenSources = rcPresent ? [] : tokenFiles;
  const report = await createAuditReport({
    dir: path.relative(process.cwd(), cwd) || '.',
    scale: 'auto',
    ...(auditTokenSources.length > 0 ? { tokenSources: auditTokenSources.map((file) => path.relative(process.cwd(), path.join(cwd, file))) } : {}),
  });
  return { auditTokenSources, rcPresent, report, tailwindConfig, tokenFiles, twMajor };
}

/**
 * The files `scaleSources` should name so Stylelint infers the audit's scale
 * on every file, not only on the one that declares the tokens (dx-02): the
 * token files the audit read, or the stylesheets it took the tokens from.
 */
function scaleSourcesFor(scale, tokenFiles) {
  if (scale.source === 'token-sources') {
    return tokenFiles.length > 0 ? tokenFiles.map(toPosix) : scale.files.map(toPosix);
  }
  if (scale.source === 'scanned-css') {
    return scale.files.map(toPosix);
  }
  return [];
}

/**
 * The Stylelint config that reproduces the audit. With a scale inferred from
 * tokens it is `scale: "auto"` pointed at the same files. With a Tailwind v3
 * config it is `scale: "auto"` with `tailwindConfigPath`. When the audit fell
 * back to the default scale, that scale is written out: `configs/tailwind`
 * would otherwise fall back to Tailwind's ladder, and the pasted config would
 * not reproduce this report (#246).
 */
function stylelintConfigFor({ nextjs = false, profile, scale, scss = false, tailwindConfig = null, tokenFiles = [] }) {
  const sources = scaleSourcesFor(scale, tokenFiles);
  let ruleOptions = null;
  if (tailwindConfig && sources.length === 0) {
    ruleOptions = { scale: 'auto', tailwindConfigPath: toPosix(tailwindConfig) };
  } else if (scale.source === 'fallback' && tokenFiles.length > 0) {
    // Token files that gave no scale: point at them anyway, so every lint
    // names why they were not read until they are fixed (tf-12). The fallback
    // is the profile's, as in the audit.
    ruleOptions = { scale: 'auto', scaleSources: tokenFiles.map(toPosix), ...(profile === 'tailwind' ? { preset: 'tailwind' } : {}) };
  } else if (scale.source === 'explicit') {
    ruleOptions = { scale: [...scale.values] };
  } else if (scale.source !== 'fallback' && scale.source !== 'default') {
    ruleOptions = { scale: 'auto', ...(sources.length > 0 ? { scaleSources: sources } : {}) };
  }
  // On a fallback the profile's own scale is the audit's (DEFAULT_SCALE for
  // recommended, Tailwind's ladder for tailwind), so no rule is written.
  return {
    extends: [`stylelint-plugin-rhythmguard/configs/${profile}`],
    // postcss-scss also parses plain CSS, so a mixed project needs only this.
    ...(scss ? { customSyntax: 'postcss-scss' } : {}),
    ...(nextjs ? { ignoreFiles: ['.next/**', 'out/**', 'node_modules/**'] } : {}),
    ...(ruleOptions ? { rules: { 'rhythmguard/use-scale': [true, ruleOptions] } } : {}),
  };
}

/**
 * The `.rhythmguardrc.json` that makes a bare `npx rhythmguard audit .` use
 * the scale this run found (ai-01): `scale: "auto"` with the token files.
 * Read by the audit and, for token sources, by the rules. It never names a
 * Tailwind config: a file in the repository must not make the audit run code
 * (only `--tailwind-config` on the command line does).
 */
function rcFor({ tokenFiles = [] }) {
  return {
    audit: {
      scale: 'auto',
      ...(tokenFiles.length > 0 ? { tokenSources: tokenFiles.map(toPosix) } : {}),
    },
  };
}

/** A line diff of two texts, `-` and `+` marked, for showing what a write replaces. */
function lineDiff(before, after) {
  const a = before.replace(/\n$/, '').split('\n');
  const b = after.replace(/\n$/, '').split('\n');
  const lengths = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i -= 1) {
    for (let j = b.length - 1; j >= 0; j -= 1) {
      lengths[i][j] = a[i] === b[j] ? lengths[i + 1][j + 1] + 1 : Math.max(lengths[i + 1][j], lengths[i][j + 1]);
    }
  }
  const lines = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      lines.push(`  ${a[i]}`);
      i += 1;
      j += 1;
    } else if (lengths[i + 1][j] >= lengths[i][j + 1]) {
      lines.push(`- ${a[i]}`);
      i += 1;
    } else {
      lines.push(`+ ${b[j]}`);
      j += 1;
    }
  }
  while (i < a.length) lines.push(`- ${a[i++]}`);
  while (j < b.length) lines.push(`+ ${b[j++]}`);
  return lines;
}

module.exports = {
  RC_FILE,
  findTailwindConfig,
  findTokenFiles,
  inferFirstRun,
  lineDiff,
  rcFor,
  readPackage,
  scaleSourcesFor,
  stylelintConfigFor,
  tailwindMajor,
  toPosix,
};
