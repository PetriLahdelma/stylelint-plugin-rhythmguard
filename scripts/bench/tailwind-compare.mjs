#!/usr/bin/env node
/**
 * The competitor test behind docs/ESLINT_PLAN.md and the ESLint package
 * README: one TSX file of spacing classes, run through each Tailwind lint tool
 * at the versions pinned in benchmarks/tailwind-compare/package.json, and
 * through this checkout's tailwind-class-use-scale. Prints a markdown table and
 * writes it to benchmarks/tailwind-compare/RESULTS.md.
 *
 *   node scripts/bench/tailwind-compare.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
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
  if (!fs.existsSync(path.join(benchDir, 'node_modules', 'eslint'))) {
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

function runCanonicalize() {
  const bin = path.join(benchDir, 'node_modules', '@tailwindcss', 'cli', 'dist', 'index.mjs');
  const result = run(process.execPath, [bin, 'canonicalize', '--format', 'json', '--css', 'app.css', ...PROBES.map(([cls]) => cls)], { cwd: workDir });
  const rows = JSON.parse(result.stdout);
  return rows.map((row) => (row.changed ? [`rewrites to \`${row.output}\``] : []));
}

const cell = (list) => (list.length ? list.join('; ').replace(/\|/g, '\\|') : '**no finding**');

install();
writeFixture();
const columns = [];
for (const tool of TOOLS) {
  const toolVersion = tool.name.startsWith('Rhythmguard')
    ? JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8')).version
    : version(tool.name);
  columns.push({ title: `${tool.name} ${toolVersion}`, rules: tool.rules, results: runEslint(tool) });
}
columns.splice(3, 0, { title: `Tailwind CLI ${version('@tailwindcss/cli')} \`canonicalize\``, rules: 'default theme', results: runCanonicalize() });

const date = new Date().toISOString().slice(0, 10);
const lines = [
  '# Tailwind spacing: what each tool does',
  '',
  `Generated ${date} by \`node scripts/bench/tailwind-compare.mjs\`, ESLint ${version('eslint')}, default Tailwind theme (\`@import "tailwindcss"\`). Each class sits alone in \`className\` in a TSX file.`,
  '',
  ...columns.map((c) => `- **${c.title}**: ${c.rules}`),
  '',
  `| Class | Case | ${columns.map((c) => c.title).join(' | ')} |`,
  `| --- | --- | ${columns.map(() => '---').join(' | ')} |`,
  ...PROBES.map(([cls, kind], index) => `| \`${cls}\` | ${kind} | ${columns.map((c) => cell(c.results[index])).join(' | ')} |`),
  '',
];
fs.writeFileSync(path.join(benchDir, 'RESULTS.md'), lines.join('\n'));
process.stdout.write(lines.join('\n'));
