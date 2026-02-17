'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const plugin = require('../src/index');

test('plugin exports rules and shared configs', () => {
  assert.ok(Array.isArray(plugin));
  assert.ok(plugin.rules);
  assert.ok(plugin.rules['rhythmguard/use-scale']);
  assert.ok(plugin.rules['rhythmguard/prefer-token']);
  assert.ok(plugin.rules['rhythmguard/no-offscale-transform']);
  assert.ok(plugin.configs.recommended);
  assert.ok(plugin.configs.strict);
  assert.ok(plugin.configs.tailwind);
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
