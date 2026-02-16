'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const {
  getScalePreset,
  listScalePresetNames,
  resolveScaleSelection,
} = require('../src/presets/scales');

test('presets expose known names and aliases', () => {
  const names = listScalePresetNames();
  assert.ok(names.includes('rhythmic-4'));
  assert.ok(names.includes('fibonacci'));

  assert.deepEqual(getScalePreset('8pt'), getScalePreset('rhythmic-8'));
  assert.deepEqual(getScalePreset('major-third'), getScalePreset('modular-major-third'));
});

test('resolveScaleSelection applies correct precedence', () => {
  const selection = resolveScaleSelection(
    {
      customScale: [0, 6, 12],
      preset: 'rhythmic-8',
      scale: [0, 3, 6],
    },
    [0, 4, 8],
  );

  assert.deepEqual(selection.scale, [0, 6, 12]);
  assert.equal(selection.selectedPreset, null);
});

test('resolveScaleSelection surfaces invalid preset names', () => {
  const selection = resolveScaleSelection(
    {
      preset: 'nope',
    },
    [0, 4, 8],
  );

  assert.equal(selection.invalidPreset, 'nope');
  assert.deepEqual(selection.scale, [0, 4, 8]);
});
