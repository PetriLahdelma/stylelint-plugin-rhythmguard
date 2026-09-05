'use strict';

const path = require('node:path');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const { pathToFileURL } = require('node:url');

const packageJson = require('../package.json');
const plugin = require('../src/index');

test('plugin exports rules, shared configs, presets, and eslint companion', () => {
  assert.ok(Array.isArray(plugin));
  assert.ok(plugin.rules);
  assert.ok(plugin.rules['rhythmguard/use-scale']);
  assert.ok(plugin.rules['rhythmguard/prefer-token']);
  assert.ok(plugin.rules['rhythmguard/no-offscale-transform']);
  assert.ok(plugin.rules['rhythmguard/use-motion-scale']);

  assert.ok(plugin.configs.recommended);
  assert.ok(plugin.configs.strict);
  assert.ok(plugin.configs.tailwind);
  assert.ok(plugin.configs.expanded);
  assert.ok(plugin.configs.logical);
  assert.ok(plugin.configs.migration);
  assert.ok(plugin.configs.motion);

  assert.deepEqual(plugin.configs.tailwind.extends, [
    'stylelint-config-tailwindcss',
    'stylelint-plugin-rhythmguard/configs/strict',
  ]);

  assert.ok(plugin.presets);
  assert.ok(plugin.presets.scales['rhythmic-4']);
  assert.ok(plugin.presets.scales['product-decimal-10']);
  assert.ok(Array.isArray(plugin.presets.listScalePresetNames()));
  assert.ok(Array.isArray(plugin.presets.listCommunityScalePresetNames()));
  assert.ok(plugin.presets.getCommunityScaleMetadata('product-decimal-10'));

  assert.ok(plugin.eslint);
  assert.ok(plugin.eslint.rules['tailwind-class-use-scale']);
  assert.ok(plugin.eslint.rules['tailwind-class-use-motion-scale']);
  assert.ok(plugin.audit.createAuditReport);
});

test('strict config avoids transform overlap in use-scale', () => {
  const strict = plugin.configs.strict;
  const useScale = strict.rules['rhythmguard/use-scale'];
  const noOffscaleTransform = strict.rules['rhythmguard/no-offscale-transform'];

  assert.ok(useScale);
  assert.ok(noOffscaleTransform);

  const useScaleOptions = useScale[1] || {};
  const properties = useScaleOptions.properties || [];

  assert.ok(Array.isArray(properties));
  assert.equal(
    properties.some((pattern) => String(pattern) === '/^transform$/'),
    false,
  );
});

test('esm entrypoint exposes default plugin object', async () => {
  const entryPath = path.join(__dirname, '..', 'src', 'index.mjs');
  const esm = await import(pathToFileURL(entryPath).href);

  assert.ok(esm.default);
  assert.ok(esm.default.rules['rhythmguard/use-scale']);
  assert.ok(esm.configs.logical);
  assert.ok(esm.configs.motion);
  assert.ok(esm.eslint.rules['tailwind-class-use-scale']);
  assert.ok(esm.eslint.rules['tailwind-class-use-motion-scale']);
  assert.ok(esm.audit.createAuditReport);
});

test('package exports expose TypeScript declaration paths', () => {
  assert.equal(packageJson.types, './types/index.d.ts');
  assert.ok(packageJson.files.includes('types'));

  for (const [exportName, descriptor] of Object.entries(packageJson.exports)) {
    assert.equal(typeof descriptor.types, 'string', `${exportName} is missing types`);
    assert.equal(
      fs.existsSync(path.join(__dirname, '..', descriptor.types)),
      true,
      `${exportName} types path does not exist`,
    );
  }
});

test('every ./configs/* package export is exposed on plugin.configs (cjs and esm)', async () => {
  const exportedConfigNames = Object.keys(packageJson.exports)
    .filter((exportName) => exportName.startsWith('./configs/'))
    .map((exportName) => exportName.slice('./configs/'.length))
    .sort();

  assert.ok(exportedConfigNames.length > 0);

  const entryPath = path.join(__dirname, '..', 'src', 'index.mjs');
  const esm = await import(pathToFileURL(entryPath).href);

  for (const name of exportedConfigNames) {
    assert.ok(plugin.configs[name], `cjs plugin.configs is missing "${name}"`);
    assert.ok(esm.configs[name], `esm configs is missing "${name}"`);
    assert.equal(
      plugin.configs[name],
      require(`../src/configs/${name}`),
      `plugin.configs.${name} must be the same object as the ./configs/${name} export`,
    );
  }

  assert.deepEqual(Object.keys(plugin.configs).sort(), exportedConfigNames);
});
