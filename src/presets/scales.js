'use strict';

function createModularScale({ base, ratio, steps }) {
  const values = [0];
  let current = base;

  for (let i = 0; i < steps; i += 1) {
    values.push(Math.round(current));
    current *= ratio;
  }

  return [...new Set(values)].sort((a, b) => a - b);
}

const SCALE_PRESETS = Object.freeze({
  'rhythmic-4': Object.freeze([0, 4, 8, 12, 16, 24, 32, 40, 48, 64]),
  'rhythmic-8': Object.freeze([0, 8, 16, 24, 32, 40, 48, 64, 80, 96]),
  compact: Object.freeze([0, 2, 4, 6, 8, 12, 16, 20, 24, 32]),
  fibonacci: Object.freeze([0, 2, 3, 5, 8, 13, 21, 34, 55, 89]),
  'powers-of-two': Object.freeze([0, 2, 4, 8, 16, 32, 64, 128]),
  'golden-ratio': Object.freeze(createModularScale({ base: 4, ratio: 1.61803398875, steps: 10 })),
  'modular-minor-third': Object.freeze(createModularScale({ base: 4, ratio: 1.2, steps: 12 })),
  'modular-major-third': Object.freeze(createModularScale({ base: 4, ratio: 1.25, steps: 12 })),
  'modular-perfect-fourth': Object.freeze(createModularScale({ base: 4, ratio: 4 / 3, steps: 12 })),
});

const PRESET_ALIASES = Object.freeze({
  '4pt': 'rhythmic-4',
  '8pt': 'rhythmic-8',
  golden: 'golden-ratio',
  'major-third': 'modular-major-third',
  'minor-third': 'modular-minor-third',
  'perfect-fourth': 'modular-perfect-fourth',
});

function normalizePresetName(name) {
  return String(name).trim().toLowerCase();
}

function resolvePresetName(name) {
  if (typeof name !== 'string' || name.trim().length === 0) {
    return null;
  }

  const normalized = normalizePresetName(name);
  return PRESET_ALIASES[normalized] || normalized;
}

function getScalePreset(name) {
  const resolvedName = resolvePresetName(name);
  if (!resolvedName) {
    return null;
  }

  return SCALE_PRESETS[resolvedName] || null;
}

function listScalePresetNames() {
  return Object.keys(SCALE_PRESETS);
}

function resolveScaleSelection(options, defaultScale) {
  const hasScale = Array.isArray(options.scale);
  const hasCustomScale = Array.isArray(options.customScale);
  const presetName = resolvePresetName(options.preset);

  let invalidPreset = null;
  let selectedPreset = null;
  let scale = defaultScale;

  if (presetName) {
    const presetScale = getScalePreset(presetName);

    if (presetScale) {
      selectedPreset = presetName;
      scale = presetScale;
    } else {
      invalidPreset = String(options.preset);
    }
  }

  if (hasScale) {
    scale = options.scale;
    selectedPreset = null;
    invalidPreset = null;
  }

  if (hasCustomScale) {
    scale = options.customScale;
    selectedPreset = null;
    invalidPreset = null;
  }

  return {
    invalidPreset,
    scale,
    selectedPreset,
  };
}

module.exports = {
  SCALE_PRESETS,
  getScalePreset,
  listScalePresetNames,
  resolveScaleSelection,
};
