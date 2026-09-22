'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { pathToFileURL } = require('node:url');

async function load() {
  return import(pathToFileURL(path.join(__dirname, '..', '..', 'scripts', 'bench', 'quiet-packages.mjs')).href);
}

const carbon = { name: 'carbon-styles', tokenPackages: [{ name: '@carbon/layout', version: '11.59.0' }] };
const primer = { name: 'primer-css', tokenPackages: [{ name: '@primer/primitives', version: '11.10.0' }] };
const primerReact = { name: 'primer-react', tokenPackages: [{ name: '@primer/primitives', version: '11.10.0' }] };

test('packageManifest pins one version per package and rejects disagreement and unknown packages', async () => {
  const { packageManifest } = await load();
  assert.deepEqual(packageManifest([carbon, primer, primerReact, { name: 'plain' }]), {
    '@carbon/layout': '11.59.0',
    '@primer/primitives': '11.10.0',
  });
  assert.throws(
    () => packageManifest([primer, { name: 'other', tokenPackages: [{ name: '@primer/primitives', version: '11.9.0' }] }]),
    /one version per package/,
  );
  assert.throws(() => packageManifest([{ name: 'x', tokenPackages: [{ name: 'left-pad', version: '1.0.0' }] }]), /token-packages\.json/);
  assert.throws(() => packageManifest([{ name: 'x', tokenPackages: [{ name: 'bootstrap' }] }]), /pinned version/);
});

test('installTokenPackages writes a pinned package.json and runs npm with scripts disabled, once', async () => {
  const { installTokenPackages, REGISTRY } = await load();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rg-bench-packages-'));
  const calls = [];
  const run = (cmd, args, options) => calls.push({ cmd, args, options });

  const first = installTokenPackages([carbon, primer], dir, { run, installed: () => null });
  assert.equal(first.skipped, false);
  assert.deepEqual(first.installed, ['@carbon/layout', '@primer/primitives']);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].cmd, 'npm');
  assert.ok(calls[0].args.includes('--ignore-scripts'), 'never runs install scripts of benchmark dependencies');
  assert.ok(calls[0].args.includes('--registry') && calls[0].args.includes(REGISTRY));
  assert.equal(calls[0].options.cwd, dir);
  const written = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
  assert.deepEqual(written.devDependencies, { '@carbon/layout': '11.59.0', '@primer/primitives': '11.10.0' });
  assert.equal(written.private, true);

  const second = installTokenPackages([carbon, primer], dir, { run, installed: (_, name) => ({ '@carbon/layout': '11.59.0', '@primer/primitives': '11.10.0' })[name] });
  assert.equal(second.skipped, true, 'nothing to do when every package is present at its pin');
  assert.equal(calls.length, 1);

  assert.deepEqual(installTokenPackages([{ name: 'plain' }], dir, { run }), { installed: [], skipped: true });
  fs.rmSync(dir, { recursive: true, force: true });
});

test('tokenSourcesFor resolves the allowlisted files under the bench packages dir and keeps the token pattern', async () => {
  const { tokenSourcesFor, describeTokenPackages } = await load();
  const dir = path.join(os.tmpdir(), 'rg-bench-packages');
  const sources = tokenSourcesFor(primer, dir, { exists: () => true });
  assert.equal(sources.length, 1);
  assert.equal(sources[0].path, path.join(dir, 'node_modules', '@primer', 'primitives', 'dist', 'css', 'base', 'size', 'size.css'));
  assert.equal(sources[0].tokenPattern, '^--base-size-\\d+$');
  assert.equal(sources[0].format, 'auto');
  assert.equal(sources[0].package, '@primer/primitives');

  const bootstrap = tokenSourcesFor({ name: 'adminlte', tokenPackages: [{ name: 'bootstrap', version: '5.3.8' }] }, dir, { exists: () => true });
  assert.equal(bootstrap[0].path, path.join(dir, 'node_modules', 'bootstrap', 'scss', '_variables.scss'));
  assert.equal('tokenPattern' in bootstrap[0], false);

  assert.throws(() => tokenSourcesFor(primer, dir, { exists: () => false }), /does not ship/);
  assert.deepEqual(tokenSourcesFor({ name: 'plain' }, dir), []);
  assert.deepEqual(describeTokenPackages(primer), ['@primer/primitives@11.10.0']);
});
