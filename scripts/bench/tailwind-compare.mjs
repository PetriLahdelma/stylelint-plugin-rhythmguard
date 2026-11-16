#!/usr/bin/env node
/**
 * The competitor test behind docs/ESLINT_PLAN.md and the ESLint package
 * README: one TSX file of spacing classes, run through each Tailwind lint tool
 * (ESLint plugins, oxlint-tailwindcss under Oxlint, the Tailwind CLI)
 * at the versions pinned in benchmarks/tailwind-compare/package.json, and
 * through this checkout's tailwind-class-use-scale. Prints a markdown table and
 * writes it to benchmarks/tailwind-compare/RESULTS.md.
 *
 *   node scripts/bench/tailwind-compare.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..');
const benchDir = path.join(repoRoot, 'benchmarks', 'tailwind-compare');
const workDir = path.join(benchDir, 'work');

// One class per line, so each finding maps back to its probe by line number.
const PROBES = [
  ['p-[13px]', 'off-scale, px'],
  ['p-[0.8125rem]', 'off-scale, rem (13px)'],
  ['gap-[18px]', 'off-scale, px'],
  ['p-[12px]', 'on-scale, bracketed'],
  ['p-3.25', 'off-scale v4 step (13px)'],
  ['gap-4.5', 'off-scale v4 step (18px)'],
  ['p-13', 'off-scale v4 step (52px)'],
  ['p-1.5', 'default-theme step (6px)'],
];
const SCALE = [0, 4, 8, 12, 16, 24, 32];

function run(cmd, args, options = {}) {
  return spawnSync(cmd, args, { encoding: 'utf8', maxBuffer: 1 << 26, ...options });
}

function install() {
  // Every pinned tool, so a checkout from before a tool was added installs it.
  const pinned = Object.keys(JSON.parse(fs.readFileSync(path.join(benchDir, 'package.json'), 'utf8')).devDependencies);
  if (pinned.some((name) => !fs.existsSync(path.join(benchDir, 'node_modules', name, 'package.json')))) {
    const result = run('npm', ['ci', '--no-audit', '--no-fund', '--registry', 'https://registry.npmjs.org'], { cwd: benchDir });
    if (result.status !== 0) throw new Error(result.stderr);
  }
}

function version(name) {
  return JSON.parse(fs.readFileSync(path.join(benchDir, 'node_modules', name, 'package.json'), 'utf8')).version;
}

function writeFixture() {
  fs.rmSync(workDir, { force: true, recursive: true });
  fs.mkdirSync(workDir, { recursive: true });
  fs.writeFileSync(path.join(workDir, 'app.css'), '@import "tailwindcss";\n');
  // Line 1 is the export; probe i sits on line i + 2.
  const body = PROBES.map(([cls]) => `    <div className="${cls}" />`).join('\n');
  fs.writeFileSync(path.join(workDir, 'probe.tsx'), `export const Probe = () => (\n  <>\n${body.split('\n').slice(0).join('\n')}\n  </>\n);\n`);
}

// The fixture's first probe is on line 3 (export, fragment open, then probes).
const lineOfProbe = (index) => index + 3;

const modules = (name) => pathToFileURL(path.join(benchDir, 'node_modules', name, 'package.json')).href;

const TOOLS = [
  {
    name: 'eslint-plugin-better-tailwindcss',
    rules: 'enforce-canonical-classes',
    config: `
import { createRequire } from 'node:module';
const require = createRequire(${JSON.stringify(modules('eslint-plugin-better-tailwindcss'))});
const tsParser = require('@typescript-eslint/parser');
const plugin = (await import(require.resolve('eslint-plugin-better-tailwindcss'))).default;
export default [{
  files: ['**/*.tsx'],
  languageOptions: { parser: tsParser, parserOptions: { ecmaFeatures: { jsx: true } } },
  plugins: { 'better-tailwindcss': plugin },
  settings: { 'better-tailwindcss': { entryPoint: 'app.css' } },
  rules: { 'better-tailwindcss/enforce-canonical-classes': 'error' },
}];`,
  },
  {
    name: 'eslint-plugin-tailwindcss',
    rules: 'no-unnecessary-arbitrary-value, enforces-canonical-classname',
    config: `
import { createRequire } from 'node:module';
const require = createRequire(${JSON.stringify(modules('eslint-plugin-tailwindcss'))});
const tsParser = require('@typescript-eslint/parser');
const plugin = require('eslint-plugin-tailwindcss');
export default [{
  files: ['**/*.tsx'],
  languageOptions: { parser: tsParser, parserOptions: { ecmaFeatures: { jsx: true } } },
  plugins: { tailwindcss: plugin },
  settings: { tailwindcss: { cssConfigPath: 'app.css' } },
  rules: { 'tailwindcss/no-unnecessary-arbitrary-value': 'error', 'tailwindcss/enforces-canonical-classname': 'error' },
}];`,
  },
  {
    name: '@shadcn/lint',
    rules: 'no-arbitrary-values',
    config: `
import { createRequire } from 'node:module';
const require = createRequire(${JSON.stringify(modules('@shadcn/lint'))});
const tsParser = require('@typescript-eslint/parser');
const { plugin } = await import(require.resolve('@shadcn/lint'));
export default [{
  files: ['**/*.tsx'],
  languageOptions: { parser: tsParser, parserOptions: { ecmaFeatures: { jsx: true } } },
  plugins: { shadcn: plugin },
  rules: { 'shadcn/no-arbitrary-values': 'error' },
}];`,
  },
  {
    name: 'Rhythmguard (this checkout)',
    rules: `tailwind-class-use-scale, scale [${SCALE.join(', ')}]`,
    config: `
import { createRequire } from 'node:module';
const require = createRequire(${JSON.stringify(modules('@typescript-eslint/parser'))});
const tsParser = require('@typescript-eslint/parser');
const plugin = (await import(${JSON.stringify(pathToFileURL(path.join(repoRoot, 'src', 'eslint', 'index.mjs')).href)})).default;
export default [{
  files: ['**/*.tsx'],
  languageOptions: { parser: tsParser, parserOptions: { ecmaFeatures: { jsx: true } } },
  plugins: { 'rhythmguard-tailwind': plugin },
  rules: { 'rhythmguard-tailwind/tailwind-class-use-scale': ['error', { scale: ${JSON.stringify(SCALE)} }] },
}];`,
  },
];

function runEslint(tool) {
  const configPath = path.join(workDir, 'eslint.config.mjs');
  fs.writeFileSync(configPath, tool.config);
  const eslintBin = path.join(benchDir, 'node_modules', 'eslint', 'bin', 'eslint.js');
  const result = run(process.execPath, [eslintBin, '--format', 'json', '--config', configPath, 'probe.tsx'], { cwd: workDir });
  let report;
  try {
    report = JSON.parse(result.stdout);
  } catch {
    throw new Error(`${tool.name}: ${result.stderr || result.stdout}`);
  }
  const messages = report[0].messages;
  const fatal = messages.find((m) => m.fatal);
  if (fatal) throw new Error(`${tool.name}: ${fatal.message}`);
  return PROBES.map((_, index) => messages
    .filter((m) => m.line === lineOfProbe(index))
    .map((m) => m.message.replace(/\s+/g, ' ').trim()));
}

// oxlint-tailwindcss is an Oxlint JS plugin, so it runs under the pinned Oxlint,
// with the default theme as its design system: the four rules that judge an
// arbitrary spacing value.
const OXLINT_TAILWIND_RULES = ['no-arbitrary-value', 'prefer-scale-token', 'no-unnecessary-arbitrary-value', 'enforce-canonical'];

function runOxlintTailwind() {
  const plugin = path.join(benchDir, 'node_modules', 'oxlint-tailwindcss', 'dist', 'index.mjs');
  fs.writeFileSync(path.join(workDir, '.oxlintrc.json'), JSON.stringify({
    jsPlugins: [{ name: 'tailwindcss', specifier: plugin }],
    settings: { tailwindcss: { entryPoint: 'app.css' } },
    rules: Object.fromEntries(OXLINT_TAILWIND_RULES.map((rule) => [`tailwindcss/${rule}`, 'error'])),
  }));
  const bin = path.join(benchDir, 'node_modules', 'oxlint', 'bin', 'oxlint');
  const result = run(process.execPath, [bin, '--format', 'json', 'probe.tsx'], { cwd: workDir });
  let report;
  try {
    report = JSON.parse(result.stdout);
  } catch {
    throw new Error(`oxlint-tailwindcss: ${result.stderr || result.stdout}`);
  }
  fs.rmSync(path.join(workDir, '.oxlintrc.json'));
  const diagnostics = report.diagnostics.filter((d) => d.code.startsWith('tailwindcss('));
  if (diagnostics.length === 0 && report.diagnostics.length > 0) {
    throw new Error(`oxlint-tailwindcss: ${report.diagnostics.map((d) => d.message).join('; ')}`);
  }
  return PROBES.map((_, index) => diagnostics
    .filter((d) => d.labels.some((label) => label.span.line === lineOfProbe(index)))
    .map((d) => d.message.replace(/\s+/g, ' ').trim()));
}

function runCanonicalize() {
  const bin = path.join(benchDir, 'node_modules', '@tailwindcss', 'cli', 'dist', 'index.mjs');
  const result = run(process.execPath, [bin, 'canonicalize', '--format', 'json', '--css', 'app.css', ...PROBES.map(([cls]) => cls)], { cwd: workDir });
  const rows = JSON.parse(result.stdout);
  return rows.map((row) => (row.changed ? [`rewrites to \`${row.output}\``] : []));
}

// The pairing in docs/TAILWIND.md ("One config, each value reported once"),
// run as written: @shadcn/lint and this checkout's rule in one ESLint config,
// on a JSX file of spacing and non-spacing arbitrary values. Every class must
// be reported by at most one rule, and every off-scale spacing class by
// Rhythmguard.
const PAIRING_PROBES = [
  ['p-[13px]', 'rhythmguard-tailwind'],
  ['md:gap-[18px]', 'rhythmguard-tailwind'],
  ['-mt-[7px]', 'rhythmguard-tailwind'],
  ['hover:-translate-y-[3px]', 'rhythmguard-tailwind'],
  ['scroll-pt-[13px]', 'rhythmguard-tailwind'],
  ['inset-x-[13px]', 'rhythmguard-tailwind'],
  ['p-[12px]', null],
  ['w-[203px]', 'shadcn'],
  ['bg-[#ff5733]', 'shadcn'],
  ['text-[13px]', 'shadcn'],
  ['rounded-[5px]', 'shadcn'],
];

function runPairing() {
  const doc = fs.readFileSync(path.join(repoRoot, 'docs', 'TAILWIND.md'), 'utf8');
  const block = [...doc.matchAll(/```js\n([\s\S]*?)```/g)].map((m) => m[1]).find((source) => source.includes("from '@shadcn/lint'"));
  if (!block) throw new Error('docs/TAILWIND.md has no @shadcn/lint pairing sample');
  const require = createRequire(path.join(benchDir, 'package.json'));
  const config = block
    .replace("from '@shadcn/lint'", `from ${JSON.stringify(pathToFileURL(require.resolve('@shadcn/lint')).href)}`)
    .replace("from 'eslint-plugin-rhythmguard'", `from ${JSON.stringify(pathToFileURL(path.join(repoRoot, 'src', 'eslint', 'index.mjs')).href)}`);
  const configPath = path.join(workDir, 'eslint.config.mjs');
  fs.writeFileSync(configPath, config);
  fs.writeFileSync(path.join(workDir, 'pairing.jsx'), `export const Pairing = () => (\n  <>\n${PAIRING_PROBES.map(([cls]) => `    <div className="${cls}" />`).join('\n')}\n  </>\n);\n`);
  const eslintBin = path.join(benchDir, 'node_modules', 'eslint', 'bin', 'eslint.js');
  const result = run(process.execPath, [eslintBin, '--format', 'json', '--config', configPath, 'pairing.jsx'], { cwd: workDir });
  const messages = JSON.parse(result.stdout)[0].messages;
  const fatal = messages.find((m) => m.fatal || !m.ruleId);
  if (fatal) throw new Error(`pairing: ${fatal.message}`);
  return PAIRING_PROBES.map(([cls, expected], index) => {
    const rules = messages.filter((m) => m.line === lineOfProbe(index)).map((m) => m.ruleId);
    const plugins = rules.map((rule) => rule.split('/')[0]);
    if (plugins.length > 1 || (plugins[0] || null) !== expected) {
      throw new Error(`pairing: ${cls} reported by [${rules.join(', ')}], expected ${expected || 'nothing'}`);
    }
    return { cls, rules };
  });
}

// Messages are quoted as each tool prints them, except that an em dash is
// shown as a hyphen.
const cell = (list) => (list.length ? list.join('; ').replace(/\s*\u2014\s*/g, ' - ').replace(/\|/g, '\\|') : '**no finding**');

install();
writeFixture();
const columns = [];
for (const tool of TOOLS) {
  const toolVersion = tool.name.startsWith('Rhythmguard')
    ? JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8')).version
    : version(tool.name);
  columns.push({ title: `${tool.name} ${toolVersion}`, rules: tool.rules, results: runEslint(tool) });
}
columns.splice(3, 0,
  { title: `oxlint-tailwindcss ${version('oxlint-tailwindcss')}`, rules: `${OXLINT_TAILWIND_RULES.join(', ')}, under Oxlint ${version('oxlint')}`, results: runOxlintTailwind() },
  { title: `Tailwind CLI ${version('@tailwindcss/cli')} \`canonicalize\``, rules: 'default theme', results: runCanonicalize() });

const pairing = runPairing();

const date = new Date().toISOString().slice(0, 10);
const lines = [
  '# Tailwind spacing: what each tool does',
  '',
  `Generated ${date} by \`node scripts/bench/tailwind-compare.mjs\`, ESLint ${version('eslint')}, default Tailwind theme (\`@import "tailwindcss"\`). Each class sits alone in \`className\` in a TSX file. Messages are quoted as printed, with an em dash shown as a hyphen.`,
  '',
  ...columns.map((c) => `- **${c.title}**: ${c.rules}`),
  '',
  `| Class | Case | ${columns.map((c) => c.title).join(' | ')} |`,
  `| --- | --- | ${columns.map(() => '---').join(' | ')} |`,
  ...PROBES.map(([cls, kind], index) => `| \`${cls}\` | ${kind} | ${columns.map((c) => cell(c.results[index])).join(' | ')} |`),
  '',
  '## Both together',
  '',
  `The @shadcn/lint pairing in [docs/TAILWIND.md](../../docs/TAILWIND.md#one-config-each-value-reported-once), run as written on a JSX file. Each class is reported by at most one rule; the script fails otherwise.`,
  '',
  '| Class | Reported by |',
  '| --- | --- |',
  ...pairing.map(({ cls, rules }) => `| \`${cls}\` | ${rules.length ? rules.map((rule) => `\`${rule}\``).join(', ') : 'nothing (on the scale)'} |`),
  '',
];
fs.writeFileSync(path.join(benchDir, 'RESULTS.md'), lines.join('\n'));
process.stdout.write(lines.join('\n'));
