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

  assert.deepEqual(
    Object.keys(plugin.configs).sort(),
    ['embed', 'motion', 'recommended', 'strict', 'tailwind'],
    '3.0 ships five configs; expanded, logical, migration and react-tailwind are documented rule blocks now',
  );
  for (const removed of ['expanded', 'logical', 'migration', 'react-tailwind']) {
    assert.equal(packageJson.exports[`./configs/${removed}`], undefined, `./configs/${removed} must no longer be exported`);
    assert.equal(fs.existsSync(path.join(__dirname, '..', 'src', 'configs', `${removed}.js`)), false, `${removed}.js must be deleted`);
  }

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
  assert.ok(esm.configs.embed);
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

test('embed config is the one-liner for shared-config authors: use-scale on auto scale at warning level, nothing else', () => {
  const embed = plugin.configs.embed;
  assert.ok(embed, 'configs.embed is missing');
  assert.deepEqual(embed.plugins, ['stylelint-plugin-rhythmguard']);
  assert.equal(embed.extends, undefined, 'embed must not pull other configs or dependencies');
  assert.deepEqual(Object.keys(embed.rules), ['rhythmguard/use-scale']);
  assert.deepEqual(embed.rules['rhythmguard/use-scale'], [
    true,
    { scale: 'auto', severity: 'warning' },
  ]);
  assert.equal(packageJson.exports['./configs/embed'].require, './src/configs/embed.js');
  assert.equal(packageJson.exports['./configs/embed'].import, './src/configs/embed.mjs');
});

test('every package export resolves to the same module through require and import', async () => {
  const root = path.join(__dirname, '..');
  for (const [subpath, conditions] of Object.entries(packageJson.exports)) {
    assert.ok(conditions.require && conditions.import && conditions.types, `${subpath} declares types, require and import`);
    for (const file of [conditions.require, conditions.import, conditions.types]) {
      assert.ok(fs.existsSync(path.join(root, file)), `${subpath}: ${file} exists`);
    }
    const cjs = require(path.join(root, conditions.require));
    const esm = await import(pathToFileURL(path.join(root, conditions.import)).href);
    assert.equal(esm.default, cjs, `${subpath}: the ESM default export is the CommonJS module object`);
    for (const name of Object.keys(esm)) {
      if (name === 'default') continue;
      assert.equal(esm[name], cjs[name], `${subpath}: named export ${name} is the same value in both formats`);
    }
  }
});

test('the CLI binary and the main entry point are inside the published files list', () => {
  const published = packageJson.files;
  for (const file of [packageJson.main, packageJson.bin.rhythmguard, packageJson.types]) {
    assert.ok(published.some((entry) => file.replace(/^\.\//, '').startsWith(entry)), `${file} is published`);
  }
});
