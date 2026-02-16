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
});
