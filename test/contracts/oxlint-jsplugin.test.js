'use strict';

/**
 * The ESLint rules run unchanged under Oxlint's JS plugins (#327): the
 * documented `.oxlintrc.json` loads the plugin, reports the off-scale classes
 * in a TSX file, and `--fix` writes the nearest step. Oxlint is not a
 * devDependency; the CI job "oxlint companion rules" installs the pinned
 * version, and the test skips where Oxlint is not installed.
 */

const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..', '..');

function oxlintBin() {
  try {
    const pkgPath = require.resolve('oxlint/package.json', { paths: [root] });
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    const bin = typeof pkg.bin === 'string' ? pkg.bin : pkg.bin.oxlint;
    return { bin: path.join(path.dirname(pkgPath), bin), version: pkg.version };
  } catch {
    return null;
  }
}

const oxlint = oxlintBin();
const skip = oxlint ? false : 'oxlint is not installed (the CI job installs the pinned version)';

const SOURCE = [
  'import { cn } from "./cn";',
  'export const A = () => <div className="p-[13px] md:gap-[18px]" />;',
  'export const B = () => <div className={cn("p-[12px]", "-m-[7px]")} />;',
  '',
].join('\n');

function fixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rhythmguard-oxlint-'));
  fs.writeFileSync(path.join(dir, '.oxlintrc.json'), JSON.stringify({
    jsPlugins: [{ name: 'rhythmguard-tailwind', specifier: path.join(root, 'src', 'eslint', 'index.js') }],
    rules: {
      'rhythmguard-tailwind/tailwind-class-use-scale': ['error', { scale: [0, 4, 8, 12, 16, 24, 32] }],
    },
  }));
  fs.writeFileSync(path.join(dir, 'a.tsx'), SOURCE);
  return dir;
}

function run(dir, args) {
  return spawnSync(process.execPath, [oxlint.bin, ...args, 'a.tsx'], { cwd: dir, encoding: 'utf8' });
}

test('tailwind-class-use-scale reports off-scale classes under Oxlint', { skip }, () => {
  const result = run(fixture(), ['-f', 'json']);
  assert.equal(result.status, 1, result.stderr);
  const messages = JSON.parse(result.stdout).diagnostics.map((d) => `${d.code}: ${d.message}`).sort();
  assert.deepEqual(messages, [
    'rhythmguard-tailwind(tailwind-class-use-scale): Unexpected Tailwind arbitrary spacing value "-m-[7px]". Use "-m-1" (4px) or "-m-2" (8px).',
    'rhythmguard-tailwind(tailwind-class-use-scale): Unexpected Tailwind arbitrary spacing value "md:gap-[18px]". Use "gap-4" (16px) or "gap-6" (24px).',
    'rhythmguard-tailwind(tailwind-class-use-scale): Unexpected Tailwind arbitrary spacing value "p-[13px]". Use "p-3" (12px) or "p-4" (16px).',
  ], `oxlint ${oxlint && oxlint.version}`);
});

test('tailwind-class-use-scale fixes to the nearest step under Oxlint', { skip }, () => {
  const dir = fixture();
  run(dir, ['--fix']);
  const fixed = fs.readFileSync(path.join(dir, 'a.tsx'), 'utf8');
  assert.match(fixed, /className="p-3 md:gap-4"/);
  assert.match(fixed, /cn\("p-\[12px\]", "-m-2"\)/);
});

test('under Oxlint, --fix leaves type, enum and aria-label probes alone (cs-04)', { skip }, () => {
  const probes = path.join(root, 'test', 'fixtures', 'ts-class-context');
  const dir = fixture();
  fs.copyFileSync(path.join(probes, 'probe.tsx'), path.join(dir, 'a.tsx'));
  const report = JSON.parse(run(dir, ['-f', 'json']).stdout).diagnostics
    .filter((d) => d.code.startsWith('rhythmguard-tailwind'))
    .map((d) => d.message);
  assert.deepEqual(report, [
    'Unexpected Tailwind arbitrary spacing value "p-[13px]". Use "p-3" (12px) or "p-4" (16px).',
  ]);
  run(dir, ['--fix']);
  assert.equal(fs.readFileSync(path.join(dir, 'a.tsx'), 'utf8'), fs.readFileSync(path.join(probes, 'probe.fixed.tsx'), 'utf8'));
});

// Every `.oxlintrc.json` sample in the docs, run as written with the plugin
// specifier pointed at this checkout.
const DOCS = [
  'packages/eslint-plugin-rhythmguard/README.md',
  'docs/TAILWIND.md',
  'docs/rules/tailwind-class-use-scale.md',
];

function oxlintSamples(markdown) {
  return [...markdown.matchAll(/```json\n([\s\S]*?)```/g)]
    .map((match) => match[1])
    .filter((block) => block.includes('"jsPlugins"'))
    .map((block) => JSON.parse(block.replace(/^\s*\/\/.*$/m, '')));
}

test('every documented .oxlintrc.json reports p-[13px]', { skip }, () => {
  let count = 0;
  for (const doc of DOCS) {
    const samples = oxlintSamples(fs.readFileSync(path.join(root, doc), 'utf8'));
    assert.ok(samples.length > 0, `${doc} has an Oxlint sample`);
    for (const sample of samples) {
      count += 1;
      for (const plugin of sample.jsPlugins) {
        assert.match(plugin.specifier, /^(eslint-plugin-rhythmguard|stylelint-plugin-rhythmguard\/eslint)$/, doc);
        plugin.specifier = path.join(root, 'src', 'eslint', 'index.js');
      }
      const dir = fixture();
      fs.writeFileSync(path.join(dir, '.oxlintrc.json'), JSON.stringify(sample));
      const result = run(dir, ['-f', 'json']);
      const messages = JSON.parse(result.stdout).diagnostics.map((d) => d.message);
      assert.ok(messages.some((m) => m.includes('"p-[13px]"')), `${doc}: ${result.stdout || result.stderr}`);
    }
  }
  assert.equal(count, DOCS.length);
});
