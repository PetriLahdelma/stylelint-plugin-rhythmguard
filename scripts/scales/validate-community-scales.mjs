#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '../..');
const schemaPath = path.join(repoRoot, 'schemas', 'community-scale.schema.json');
const communityDir = path.join(repoRoot, 'scales', 'community');

const CORE_PRESET_NAMES = new Set([
  'rhythmic-4',
  'rhythmic-8',
  'product-material-8dp',
  'product-atlassian-8px',
  'product-carbon-2x',
  'editorial-baseline-4',
  'editorial-baseline-6',
  'compact',
  'fibonacci',
  'powers-of-two',
  'golden-ratio',
  'modular-major-second',
  'modular-minor-third',
  'modular-major-third',
  'modular-augmented-fourth',
  'modular-perfect-fourth',
  'modular-perfect-fifth',
]);

const CORE_ALIASES = new Set([
  '4pt',
  '8pt',
  'atlassian-8',
  'carbon',
  'material',
  'baseline-4',
  'baseline-6',
  'golden',
  'major-second',
  'major-third',
  'minor-third',
  'augmented-fourth',
  'perfect-fifth',
  'perfect-fourth',
]);

function normalizeName(value) {
  if (typeof value !== 'string') {
    return '';
  }

  return value.trim().toLowerCase();
}

function assert(condition, message, errors) {
  if (!condition) {
    errors.push(message);
  }
}

function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function readSchemaRequiredKeys() {
  try {
    const schemaRaw = fs.readFileSync(schemaPath, 'utf8');
    const schema = JSON.parse(schemaRaw);
    return Array.isArray(schema.required) ? schema.required : [];
  } catch {
    return ['name', 'description', 'base', 'steps'];
  }
}

function validateScaleDocument(doc, fileName, seenNames, seenAliases, schemaRequiredKeys) {
  const errors = [];
  const prefix = `${fileName}:`;

  assert(doc && typeof doc === 'object' && !Array.isArray(doc), `${prefix} scale must be a JSON object`, errors);
  if (errors.length > 0) {
    return errors;
  }

  for (const key of schemaRequiredKeys) {
    assert(Object.prototype.hasOwnProperty.call(doc, key), `${prefix} missing required field \`${key}\``, errors);
  }

  const name = normalizeName(doc.name);
  assert(name.length > 0, `${prefix} \`name\` must be a non-empty string`, errors);
  assert(/^[a-z0-9][a-z0-9-]{2,63}$/.test(name), `${prefix} \`name\` must match ^[a-z0-9][a-z0-9-]{2,63}$`, errors);
  assert(!CORE_PRESET_NAMES.has(name), `${prefix} \`name\` collides with a core preset`, errors);
  assert(!seenNames.has(name), `${prefix} duplicate community scale name \`${name}\``, errors);
  assert(!seenAliases.has(name), `${prefix} \`name\` collides with an existing community alias \`${name}\``, errors);

  assert(typeof doc.description === 'string', `${prefix} \`description\` must be a string`, errors);
  if (typeof doc.description === 'string') {
    assert(doc.description.trim().length >= 12, `${prefix} \`description\` must be at least 12 characters`, errors);
  }

  assert(isFiniteNumber(doc.base), `${prefix} \`base\` must be a finite number`, errors);
  if (isFiniteNumber(doc.base)) {
    assert(doc.base >= 0, `${prefix} \`base\` must be non-negative`, errors);
  }

  assert(Array.isArray(doc.steps), `${prefix} \`steps\` must be an array`, errors);
  if (Array.isArray(doc.steps)) {
    assert(doc.steps.length >= 3, `${prefix} \`steps\` must include at least 3 values`, errors);

    let previous = null;
    const set = new Set();
    for (const step of doc.steps) {
      assert(isFiniteNumber(step), `${prefix} all \`steps\` values must be finite numbers`, errors);
      if (!isFiniteNumber(step)) {
        continue;
      }

      assert(step >= 0, `${prefix} \`steps\` values must be non-negative`, errors);
      assert(!set.has(step), `${prefix} \`steps\` must not contain duplicates`, errors);
      if (previous !== null) {
        assert(step > previous, `${prefix} \`steps\` must be strictly increasing`, errors);
      }

      set.add(step);
      previous = step;
    }

    if (isFiniteNumber(doc.steps[0])) {
      assert(doc.steps[0] === 0, `${prefix} \`steps\` must start with 0`, errors);
    }
  }

  const aliases = doc.aliases ?? [];
  assert(Array.isArray(aliases), `${prefix} \`aliases\` must be an array when provided`, errors);
  if (Array.isArray(aliases)) {
    const localAliases = new Set();

    for (const alias of aliases) {
      const normalizedAlias = normalizeName(alias);
      assert(normalizedAlias.length > 0, `${prefix} alias values must be non-empty strings`, errors);
      assert(/^[a-z0-9][a-z0-9-]{1,63}$/.test(normalizedAlias), `${prefix} alias \`${normalizedAlias}\` has invalid format`, errors);
      assert(!localAliases.has(normalizedAlias), `${prefix} duplicate alias \`${normalizedAlias}\` inside file`, errors);
      assert(!CORE_PRESET_NAMES.has(normalizedAlias), `${prefix} alias \`${normalizedAlias}\` collides with a core preset name`, errors);
      assert(!CORE_ALIASES.has(normalizedAlias), `${prefix} alias \`${normalizedAlias}\` collides with a core alias`, errors);
      assert(!seenNames.has(normalizedAlias), `${prefix} alias \`${normalizedAlias}\` collides with a community preset name`, errors);
      assert(!seenAliases.has(normalizedAlias), `${prefix} duplicate alias across community scales: \`${normalizedAlias}\``, errors);

      localAliases.add(normalizedAlias);
    }

    if (!errors.some((entry) => entry.startsWith(prefix))) {
      for (const alias of localAliases) {
        seenAliases.add(alias);
      }
    }
  }

  if (errors.length === 0) {
    seenNames.add(name);
    seenAliases.add(name);
  }

  return errors;
}

function main() {
  if (!fs.existsSync(communityDir)) {
    console.error('Community scale directory not found:', communityDir);
    process.exit(1);
  }

  const entries = fs
    .readdirSync(communityDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b));

  if (entries.length === 0) {
    console.error('No community scale JSON files found in scales/community.');
    process.exit(1);
  }

  const schemaRequiredKeys = readSchemaRequiredKeys();
  const seenNames = new Set();
  const seenAliases = new Set();
  const allErrors = [];

  for (const fileName of entries) {
    const absolutePath = path.join(communityDir, fileName);
    let parsed;

    try {
      parsed = JSON.parse(fs.readFileSync(absolutePath, 'utf8'));
    } catch (error) {
      allErrors.push(`${fileName}: invalid JSON (${error.message})`);
      continue;
    }

    const errors = validateScaleDocument(parsed, fileName, seenNames, seenAliases, schemaRequiredKeys);
    allErrors.push(...errors);
  }

  if (allErrors.length > 0) {
    console.error('Community scale validation failed:\n');
    for (const error of allErrors) {
      console.error(`- ${error}`);
    }
    process.exit(1);
  }

  console.log(`Validated ${entries.length} community scale file(s) successfully.`);
}

main();
