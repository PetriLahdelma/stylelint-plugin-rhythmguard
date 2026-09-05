'use strict';

/**
 * `npx rhythmguard` with no arguments.
 *
 * The first minute, with nothing to configure: detect the stack and any token
 * files, infer the spacing scale from the project's own tokens, audit the
 * current directory, and end with the exact config to paste. Never fails the
 * process on findings; this is a report, not a gate.
 */

const fs = require('node:fs');
const path = require('node:path');

const { createAuditReport } = require('../audit/report');
const { detect } = require('./init');

const TOKEN_FILE_PATTERN = /(^|[.-])tokens?\.json$/i;
const TOKEN_DIRS = ['tokens', 'design-tokens', path.join('src', 'tokens'), path.join('dist', 'tokens')];
const MAX_LISTED = 5;

function readPackage(cwd) {
  try {
    return JSON.parse(fs.readFileSync(path.join(cwd, 'package.json'), 'utf8'));
  } catch {
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
  const consider = (dir) => {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.isFile() && TOKEN_FILE_PATTERN.test(entry.name)) {
        found.add(path.relative(cwd, path.join(dir, entry.name)));
      }
    }
  };
  consider(cwd);
  for (const sub of TOKEN_DIRS) {
    consider(path.join(cwd, sub));
  }
  return Array.from(found).sort();
}

function hasRhythmguardConfig(cwd) {
  return fs.existsSync(path.join(cwd, '.rhythmguardrc.json'));
}

function toPosix(relativePath) {
  return `./${relativePath.split(path.sep).join('/')}`;
}

function topEntries(counts, limit = MAX_LISTED) {
  return Object.entries(counts || {})
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit);
}

function suggestedStylelintConfig({ profile, tokenFiles }) {
  const ruleOptions = { scale: 'auto' };
  if (tokenFiles.length > 0) {
    ruleOptions.scaleSources = tokenFiles.map(toPosix);
  }
  return {
    extends: [`stylelint-plugin-rhythmguard/configs/${profile}`],
    rules: {
      'rhythmguard/use-scale': [true, ruleOptions],
    },
  };
}

function eslintSnippet(scaleValues) {
  const scale = scaleValues.filter((value) => typeof value === 'number').join(', ');
  return [
    "// eslint.config.js",
    "import rhythmguard from 'stylelint-plugin-rhythmguard/eslint';",
    '',
    'export default [',
    '  {',
    "    plugins: { 'rhythmguard-tailwind': rhythmguard },",
    `    rules: { 'rhythmguard-tailwind/tailwind-class-use-scale': ['warn', { scale: [${scale}] }] },`,
    '  },',
    '];',
  ].join('\n');
}

function describeScale(scale) {
  if (!scale) {
    return 'default';
  }
  const files = scale.files && scale.files.length > 0 ? ` (${scale.files.slice(0, 3).join(', ')}${scale.files.length > 3 ? ', …' : ''})` : '';
  return `${scale.source}${files}`;
}

async function run() {
  const cwd = process.cwd();
  const pkg = readPackage(cwd);
  const stack = detect();
  const twMajor = stack.tailwind ? tailwindMajor(pkg) : null;
  const tokenFiles = findTokenFiles(cwd);
  const rcPresent = hasRhythmguardConfig(cwd);
  const out = [];

  out.push('', '  Rhythmguard quickstart', `  ${cwd}`, '');
  out.push('  Detected');
  out.push(`    Tailwind        ${stack.tailwind ? `v${twMajor || '?'}` : 'no'}`);
  out.push(`    Next.js         ${stack.nextjs ? 'yes' : 'no'}`);
  out.push(`    Stylelint config ${stack.hasExistingConfig ? 'present' : 'none'}`);
  out.push(`    Token files     ${tokenFiles.length > 0 ? tokenFiles.join(', ') : 'none found'}`);
  out.push(`    .rhythmguardrc  ${rcPresent ? 'present (its token sources are used)' : 'none'}`);
  out.push('');

  let report;
  try {
    report = await createAuditReport({
      dir: '.',
      scale: 'auto',
      ...(tokenFiles.length > 0 && !rcPresent
        ? { tokenSources: tokenFiles }
        : {}),
    });
  } catch (error) {
    process.stderr.write(`Quickstart could not audit ${cwd}: ${error.message}\n`);
    process.exitCode = 1;
    return;
  }

  if (report.cssFilesScanned === 0 && report.templateFilesScanned === 0) {
    out.push('  No CSS files found here. Run from your project root, or audit a directory directly:');
    out.push('    npx rhythmguard audit ./src', '');
    process.stdout.write(`${out.join('\n')}\n`);
    return;
  }

  const scale = report.scale;
  out.push('  Scale');
  out.push(`    Scale           ${scale.values.join(', ')}`);
  out.push(`    Source          ${describeScale(scale)}`);
  if (scale.source === 'fallback') {
    out.push('    Note            No spacing tokens found; the rhythmic-4 preset is being used.');
    out.push('                    Add scaleSources or define --space-*/--spacing-* custom properties to lint against your own scale.');
  }
  out.push('');

  const offScale = report.findings.css.filter((finding) => finding.type === 'off-scale');
  out.push('  Findings');
  out.push(`    CSS files       ${report.cssFilesScanned}`);
  out.push(`    Template files  ${report.templateFilesScanned}`);
  out.push(`    Off-scale       ${offScale.length} in CSS, ${report.findings.tailwind.length} in class strings`);
  out.push(`    Token opps      ${report.findings.css.length - offScale.length} raw values that match or deserve a token`);
  out.push(`    Cleanliness     ${report.scaleCleanliness}%`);
  const topValues = topEntries(report.offScaleValues);
  if (topValues.length > 0) {
    out.push(`    Top values      ${topValues.map(([value, count]) => `${value} ×${count}`).join(', ')}`);
  }
  const topFiles = (report.topAffectedFiles || []).slice(0, 3);
  if (topFiles.length > 0) {
    out.push(`    Top files       ${topFiles.map((entry) => `${entry.file} (${entry.count})`).join(', ')}`);
  }
  out.push('');

  const profile = stack.tailwind ? (stack.nextjs ? 'react-tailwind' : 'tailwind') : 'recommended';
  out.push(`  Paste this into .stylelintrc.json${stack.hasExistingConfig ? ' (merge with your existing config)' : ''}:`, '');
  out.push(JSON.stringify(suggestedStylelintConfig({ profile, tokenFiles }), null, 2).replace(/^/gm, '    '));
  out.push('');

  if (stack.tailwind) {
    out.push('  Tailwind class strings need the ESLint companion. Paste this into eslint.config.js:', '');
    out.push(eslintSnippet(scale.values).replace(/^/gm, '    '));
    out.push('');
  }

  out.push('  Next');
  out.push('    npx stylelint "**/*.css"                      lint with the config above');
  out.push('    npx rhythmguard audit . --format markdown     PR-ready report');
  out.push('    npx rhythmguard audit . --write-baseline      then gate only new drift in CI');
  out.push('    npx rhythmguard doctor                        check the setup');
  out.push('');

  process.stdout.write(`${out.join('\n')}\n`);
}

module.exports = { findTokenFiles, run, suggestedStylelintConfig, tailwindMajor };
