#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '../..');
const outDir = path.join(repoRoot, 'scales', 'community');

function parseArgs(argv) {
  const out = {};

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('--')) {
      continue;
    }

    const key = token.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith('--')) {
      out[key] = true;
      continue;
    }

    out[key] = next;
    i += 1;
  }

  return out;
}

function toSlug(value) {
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

function parseList(raw) {
  if (!raw) {
    return [];
  }

  return String(raw)
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function parseSteps(raw) {
  const steps = parseList(raw).map((entry) => Number(entry));
  if (steps.some((value) => !Number.isFinite(value))) {
    throw new Error('`--steps` must contain only numbers, comma-separated');
  }
  return steps;
}

function printHelp() {
  console.log('Usage: npm run scales:add -- --name my-scale [options]');
  console.log('');
  console.log('Required:');
  console.log('  --name            Preset name (kebab-case)');
  console.log('');
  console.log('Optional:');
  console.log('  --description     One-line description');
  console.log('  --base            Base unit in px (default: 4)');
  console.log('  --steps           Comma-separated values (default: 0,4,8,12,16,24,32,40,48,64)');
  console.log('  --aliases         Comma-separated aliases');
  console.log('  --tags            Comma-separated tags');
  console.log('  --contributor     Contributor name');
  console.log('  --contributor-url Contributor URL');
}

function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help || args.h) {
    printHelp();
    process.exit(0);
  }

  if (!args.name) {
    printHelp();
    process.exit(1);
  }

  const name = toSlug(args.name);
  if (!/^[a-z0-9][a-z0-9-]{2,63}$/.test(name)) {
    console.error('`--name` must resolve to a valid kebab-case id (3-64 chars).');
    process.exit(1);
  }

  const base = args.base ? Number(args.base) : 4;
  if (!Number.isFinite(base) || base < 0) {
    console.error('`--base` must be a non-negative number.');
    process.exit(1);
  }

  const steps = args.steps
    ? parseSteps(args.steps)
    : [0, 4, 8, 12, 16, 24, 32, 40, 48, 64];

  const record = {
    name,
    description:
      args.description ||
      'Describe the intended use-case for this scale (compact UI, editorial baseline, etc.).',
    base,
    steps,
    aliases: parseList(args.aliases),
    tags: parseList(args.tags),
    contributor: args.contributor || 'Your Name',
  };

  if (args['contributor-url']) {
    record.contributorUrl = String(args['contributor-url']);
  }

  const outFile = path.join(outDir, `${name}.json`);
  if (fs.existsSync(outFile)) {
    console.error(`Scale file already exists: ${outFile}`);
    process.exit(1);
  }

  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(outFile, `${JSON.stringify(record, null, 2)}\n`, 'utf8');

  console.log(`Created ${path.relative(repoRoot, outFile)}`);
  console.log('Next steps:');
  console.log('1. Edit the JSON values as needed');
  console.log('2. Run: npm run scales:validate');
  console.log('3. Open a PR');
}

main();
