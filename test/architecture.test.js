'use strict';

/**
 * Executable dependency rules. The layers and the direction they may depend in
 * are documented in docs/ARCHITECTURE.md; this test is what keeps that page true.
 *
 *   core     pure domain logic: lengths, times, scales, tokens, value walking
 *   presets  built-in and community scales (data)
 *   rules    Stylelint adapters over core
 *   eslint   ESLint adapters over core (must never load Stylelint)
 *   audit    project-level analysis over core and the rules, via Stylelint's API
 *   cli      thin command wrappers over audit and core
 *   configs  shareable Stylelint configs (data)
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const srcDir = path.join(__dirname, '..', 'src');

const ALLOWED = {
  core: ['core', 'presets'],
  presets: ['presets'],
  rules: ['rules', 'core', 'presets'],
  eslint: ['eslint', 'core'],
  audit: ['audit', 'core', 'presets'],
  cli: ['cli', 'audit', 'core', 'presets', 'configs'],
  configs: ['configs'],
};

const FORBIDDEN_PACKAGES = {
  core: ['stylelint', 'eslint'],
  presets: ['stylelint', 'eslint', 'postcss-value-parser'],
  eslint: ['stylelint'],
  configs: ['stylelint', 'eslint', 'postcss-value-parser'],
};

function listSourceFiles(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) listSourceFiles(full, out);
    else if (/\.(?:js|mjs)$/.test(entry.name)) out.push(full);
  }
  return out;
}

function layerOf(file) {
  const relative = path.relative(srcDir, file);
  return relative.includes(path.sep) ? relative.split(path.sep)[0] : 'root';
}

function specifiersOf(file) {
  const source = fs.readFileSync(file, 'utf8');
  const found = [];
  for (const match of source.matchAll(/require\(\s*['"]([^'"]+)['"]\s*\)|from\s+['"]([^'"]+)['"]/g)) {
    found.push(match[1] || match[2]);
  }
  return found;
}

function resolveInternal(file, specifier) {
  const target = path.resolve(path.dirname(file), specifier);
  for (const candidate of [target, `${target}.js`, path.join(target, 'index.js')]) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
  }
  return null;
}

const files = listSourceFiles(srcDir);
const graph = new Map(files.map((file) => [file, []]));
const packageImports = new Map(files.map((file) => [file, []]));
for (const file of files) {
  for (const specifier of specifiersOf(file)) {
    if (specifier.startsWith('.')) {
      const resolved = resolveInternal(file, specifier);
      if (resolved && !resolved.endsWith('.json')) graph.get(file).push(resolved);
    } else if (!specifier.startsWith('node:')) {
      packageImports.get(file).push(specifier.split('/')[0].startsWith('@') ? specifier.split('/').slice(0, 2).join('/') : specifier.split('/')[0]);
    }
  }
}

test('every src layer only depends on the layers it is allowed to', () => {
  const violations = [];
  for (const [file, deps] of graph) {
    const from = layerOf(file);
    if (from === 'root') continue;
    for (const dep of deps) {
      const to = layerOf(dep);
      if (to === 'root') continue;
      if (!ALLOWED[from] || !ALLOWED[from].includes(to)) {
        violations.push(`${path.relative(srcDir, file)} (${from}) -> ${path.relative(srcDir, dep)} (${to})`);
      }
    }
  }
  assert.deepEqual(violations, []);
});

test('framework packages stay out of the layers that must not know them', () => {
  const violations = [];
  for (const [file, packages] of packageImports) {
    const layer = layerOf(file);
    for (const pkg of packages) {
      if ((FORBIDDEN_PACKAGES[layer] || []).includes(pkg)) {
        violations.push(`${path.relative(srcDir, file)} imports ${pkg}`);
      }
    }
  }
  assert.deepEqual(violations, []);
});

test('the internal module graph has no cycles', () => {
  const state = new Map();
  const stack = [];
  const cycles = [];
  const visit = (node) => {
    state.set(node, 'visiting');
    stack.push(node);
    for (const dep of graph.get(node) || []) {
      if (state.get(dep) === 'visiting') {
        cycles.push(stack.slice(stack.indexOf(dep)).concat(dep).map((f) => path.relative(srcDir, f)).join(' -> '));
      } else if (!state.has(dep)) {
        visit(dep);
      }
    }
    stack.pop();
    state.set(node, 'done');
  };
  for (const file of files) if (!state.has(file)) visit(file);
  assert.deepEqual(cycles, []);
});

test('every package imported at runtime is a declared dependency or peer', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
  const declared = new Set([...Object.keys(manifest.dependencies || {}), ...Object.keys(manifest.peerDependencies || {})]);
  const undeclared = new Set();
  for (const [file, packages] of packageImports) {
    for (const pkg of packages) if (!declared.has(pkg) && pkg !== manifest.name) undeclared.add(`${path.relative(srcDir, file)} imports ${pkg}`);
  }
  assert.deepEqual([...undeclared], []);
});
