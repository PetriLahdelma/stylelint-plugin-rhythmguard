'use strict';

const fs = require('node:fs');
const path = require('node:path');

function normalizePresetName(name) {
  if (typeof name !== 'string') {
    return '';
  }

  return name.trim().toLowerCase();
}

function createModularScale({ base, ratio, steps }) {
  const values = [0];
  let current = base;

  for (let i = 0; i < steps; i += 1) {
    values.push(Math.round(current));
    current *= ratio;
  }

  return [...new Set(values)].sort((a, b) => a - b);
}

const CORE_SCALE_PRESETS = Object.freeze({
  'rhythmic-4': Object.freeze([0, 4, 8, 12, 16, 24, 32, 40, 48, 64]),
  'rhythmic-8': Object.freeze([0, 8, 16, 24, 32, 40, 48, 64, 80, 96]),
  'product-material-8dp': Object.freeze([0, 4, 8, 12, 16, 24, 32, 40, 48, 56, 64, 72, 80]),
  'product-atlassian-8px': Object.freeze([0, 2, 4, 6, 8, 12, 16, 20, 24, 32, 40, 48, 64, 80]),
  'product-carbon-2x': Object.freeze([0, 2, 4, 8, 12, 16, 24, 32, 40, 48, 64, 80]),
  'editorial-baseline-4': Object.freeze([0, 4, 8, 12, 16, 20, 24, 28, 32, 40, 48, 56, 64]),
  'editorial-baseline-6': Object.freeze([0, 6, 12, 18, 24, 30, 36, 48, 60, 72]),
  compact: Object.freeze([0, 2, 4, 6, 8, 12, 16, 20, 24, 32]),
  fibonacci: Object.freeze([0, 2, 3, 5, 8, 13, 21, 34, 55, 89]),
  'powers-of-two': Object.freeze([0, 2, 4, 8, 16, 32, 64, 128]),
  'golden-ratio': Object.freeze(createModularScale({ base: 4, ratio: 1.61803398875, steps: 10 })),
  'modular-major-second': Object.freeze(createModularScale({ base: 8, ratio: 1.125, steps: 12 })),
  'modular-minor-third': Object.freeze(createModularScale({ base: 4, ratio: 1.2, steps: 12 })),
  'modular-major-third': Object.freeze(createModularScale({ base: 4, ratio: 1.25, steps: 12 })),
  'modular-augmented-fourth': Object.freeze(createModularScale({ base: 4, ratio: 1.41421356237, steps: 12 })),
  'modular-perfect-fourth': Object.freeze(createModularScale({ base: 4, ratio: 4 / 3, steps: 12 })),
  'modular-perfect-fifth': Object.freeze(createModularScale({ base: 4, ratio: 1.5, steps: 12 })),
});

const CORE_PRESET_ALIASES = Object.freeze({
  '4pt': 'rhythmic-4',
  '8pt': 'rhythmic-8',
  'atlassian-8': 'product-atlassian-8px',
  carbon: 'product-carbon-2x',
  material: 'product-material-8dp',
  'baseline-4': 'editorial-baseline-4',
  'baseline-6': 'editorial-baseline-6',
  golden: 'golden-ratio',
  'major-second': 'modular-major-second',
  'major-third': 'modular-major-third',
  'minor-third': 'modular-minor-third',
  'augmented-fourth': 'modular-augmented-fourth',
  'perfect-fifth': 'modular-perfect-fifth',
  'perfect-fourth': 'modular-perfect-fourth',
});

function normalizeCommunitySteps(steps) {
  if (!Array.isArray(steps) || steps.length === 0) {
    return null;
  }

  const normalized = [];
  let previous = null;

  for (const value of steps) {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
      return null;
    }

    if (previous !== null && value <= previous) {
      return null;
    }

    normalized.push(value);
    previous = value;
  }

  if (normalized[0] !== 0) {
    return null;
  }

  return Object.freeze(normalized);
}

function loadCommunityScales() {
  const communityDirectory = path.resolve(__dirname, '../../scales/community');
  if (!fs.existsSync(communityDirectory)) {
    return [];
  }

  const namesInUse = new Set(Object.keys(CORE_SCALE_PRESETS));
  const aliasesInUse = new Set([...Object.keys(CORE_SCALE_PRESETS), ...Object.keys(CORE_PRESET_ALIASES)]);

  const fileNames = fs
    .readdirSync(communityDirectory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b));

  const definitions = [];

  for (const fileName of fileNames) {
    const absolutePath = path.join(communityDirectory, fileName);

    let parsed;
    try {
      parsed = JSON.parse(fs.readFileSync(absolutePath, 'utf8'));
    } catch {
      continue;
    }

    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      continue;
    }

    const presetName = normalizePresetName(parsed.name);
    if (!presetName || namesInUse.has(presetName)) {
      continue;
    }

    const steps = normalizeCommunitySteps(parsed.steps);
    if (!steps) {
      continue;
    }

    const aliases = [];
    if (Array.isArray(parsed.aliases)) {
      for (const aliasEntry of parsed.aliases) {
        const alias = normalizePresetName(aliasEntry);
        if (!alias || alias === presetName || aliasesInUse.has(alias)) {
          continue;
        }

        aliases.push(alias);
        aliasesInUse.add(alias);
      }
    }

    namesInUse.add(presetName);
    aliasesInUse.add(presetName);

    definitions.push(
      Object.freeze({
        aliases: Object.freeze(aliases),
        base: typeof parsed.base === 'number' && Number.isFinite(parsed.base) ? parsed.base : null,
        contributor: typeof parsed.contributor === 'string' ? parsed.contributor : null,
        contributorUrl: typeof parsed.contributorUrl === 'string' ? parsed.contributorUrl : null,
        description: typeof parsed.description === 'string' ? parsed.description : null,
        fileName,
        name: presetName,
        steps,
        tags: Object.freeze(Array.isArray(parsed.tags) ? parsed.tags.filter((tag) => typeof tag === 'string') : []),
      }),
    );
  }

  return definitions;
}

const COMMUNITY_SCALE_DEFINITIONS = Object.freeze(loadCommunityScales());

const COMMUNITY_SCALE_PRESETS = Object.freeze(
  Object.fromEntries(COMMUNITY_SCALE_DEFINITIONS.map((definition) => [definition.name, definition.steps])),
);

const COMMUNITY_PRESET_ALIASES = Object.freeze(
  Object.assign(
    {},
    ...COMMUNITY_SCALE_DEFINITIONS.map((definition) =>
      Object.fromEntries(definition.aliases.map((alias) => [alias, definition.name])),
    ),
  ),
);

const COMMUNITY_SCALE_METADATA = Object.freeze(
  Object.fromEntries(
    COMMUNITY_SCALE_DEFINITIONS.map((definition) => [
      definition.name,
      Object.freeze({
        aliases: definition.aliases,
        base: definition.base,
        contributor: definition.contributor,
        contributorUrl: definition.contributorUrl,
        description: definition.description,
        fileName: definition.fileName,
        tags: definition.tags,
      }),
    ]),
  ),
);

const SCALE_PRESETS = Object.freeze({
  ...CORE_SCALE_PRESETS,
  ...COMMUNITY_SCALE_PRESETS,
});

const PRESET_ALIASES = Object.freeze({
  ...CORE_PRESET_ALIASES,
  ...COMMUNITY_PRESET_ALIASES,
});

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
  return Object.keys(SCALE_PRESETS).sort((a, b) => a.localeCompare(b));
}

function listCommunityScalePresetNames() {
  return Object.keys(COMMUNITY_SCALE_PRESETS).sort((a, b) => a.localeCompare(b));
}

function getCommunityScaleMetadata(name) {
  const normalizedName = resolvePresetName(name);
  if (!normalizedName) {
    return null;
  }

  return COMMUNITY_SCALE_METADATA[normalizedName] || null;
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
  COMMUNITY_SCALE_DEFINITIONS,
  COMMUNITY_SCALE_METADATA,
  COMMUNITY_SCALE_PRESETS,
  CORE_PRESET_ALIASES,
  CORE_SCALE_PRESETS,
  PRESET_ALIASES,
  SCALE_PRESETS,
  getCommunityScaleMetadata,
  getScalePreset,
  listCommunityScalePresetNames,
  listScalePresetNames,
  resolveScaleSelection,
};
