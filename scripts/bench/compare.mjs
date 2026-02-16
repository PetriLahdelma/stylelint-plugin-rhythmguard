#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';

const { default: stylelint } = await import('stylelint');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..', '..');
const outputDir = path.join(repoRoot, 'benchmarks');
const outputFile = path.join(outputDir, 'latest.json');

const SHARED_SCALE = [0, 4, 8, 12, 16, 24, 32, 40, 48, 64];
const SHARED_PROPERTIES = [
  /^inset(?:-.+)?$/,
  /^gap$/,
  /^row-gap$/,
  /^column-gap$/,
  /^margin(?:-.+)?$/,
  /^padding(?:-.+)?$/,
];

const onScale = SHARED_SCALE.filter((value) => value !== 0);
const offScale = [1, 2, 3, 5, 6, 7, 9, 10, 11, 13, 14, 15, 17, 18, 19, 22, 26, 30];
const spacingProperties = [
  'margin',
  'margin-top',
  'margin-inline',
  'padding',
  'padding-block',
  'gap',
  'row-gap',
  'column-gap',
  'inset',
  'inset-inline-start',
];

function parseArgs(argv) {
  const args = {
    decls: 6,
    fix: false,
    iterations: 8,
    selectors: 4000,
    seed: 1337,
    warmup: 2,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];

    if (token === '--fix') {
      args.fix = true;
      continue;
    }

    const next = argv[i + 1];
    if (!next) {
      continue;
    }

    switch (token) {
      case '--selectors':
        args.selectors = Number(next);
        i += 1;
        break;
      case '--decls':
        args.decls = Number(next);
        i += 1;
        break;
      case '--iterations':
        args.iterations = Number(next);
        i += 1;
        break;
      case '--warmup':
        args.warmup = Number(next);
        i += 1;
        break;
      case '--seed':
        args.seed = Number(next);
        i += 1;
        break;
      default:
        break;
    }
  }

  return args;
}

function createRng(seed) {
  let state = seed >>> 0;

  return () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function pick(list, random) {
  return list[Math.floor(random() * list.length)];
}

function formatMs(number) {
  return `${number.toFixed(2)}ms`;
}

function computeStats(samples) {
  const sorted = [...samples].sort((a, b) => a - b);
  const total = samples.reduce((sum, value) => sum + value, 0);
  const mean = total / samples.length;
  const median = sorted[Math.floor(sorted.length / 2)];
  const p95 = sorted[Math.max(0, Math.ceil(sorted.length * 0.95) - 1)];
  const min = sorted[0];
  const max = sorted[sorted.length - 1];
  const variance =
    samples.reduce((sum, value) => sum + (value - mean) ** 2, 0) / samples.length;
  const stdDev = Math.sqrt(variance);

  return {
    max,
    mean,
    median,
    min,
    p95,
    stdDev,
  };
}

function buildCorpus({ decls, selectors, seed }) {
  const random = createRng(seed);
  const blocks = [];

  for (let i = 0; i < selectors; i += 1) {
    const declarations = [];

    for (let j = 0; j < decls; j += 1) {
      const property = pick(spacingProperties, random);
      const shouldUseOffScale = random() < 0.42;
      const source = shouldUseOffScale ? offScale : onScale;
      const rawValue = pick(source, random);
      const negativeAllowed = property.startsWith('margin') || property.startsWith('inset');
      const signedValue =
        negativeAllowed && random() < 0.08 ? -rawValue : rawValue;

      declarations.push(`${property}: ${signedValue}px;`);
    }

    blocks.push(`.bench-${i} { ${declarations.join(' ')} }`);
  }

  return blocks.join('\n');
}

async function runCase({ code, config, fix, iterations, name, warmup }) {
  const samples = [];
  let warningCount = 0;

  for (let i = 0; i < warmup + iterations; i += 1) {
    const start = performance.now();
    const lintResult = await stylelint.lint({
      code,
      config,
      fix,
    });
    const end = performance.now();

    warningCount = lintResult.results[0].warnings.length;

    if (i >= warmup) {
      samples.push(end - start);
    }
  }

  return {
    name,
    stats: computeStats(samples),
    warningCount,
  };
}

function printResultRows(results, baselineName) {
  const baseline = results.find((entry) => entry.name === baselineName);

  const rows = results.map((entry) => {
    const delta = baseline
      ? ((entry.stats.mean - baseline.stats.mean) / baseline.stats.mean) * 100
      : 0;

    return {
      case: entry.name,
      warnings: entry.warningCount,
      mean: formatMs(entry.stats.mean),
      median: formatMs(entry.stats.median),
      p95: formatMs(entry.stats.p95),
      stddev: formatMs(entry.stats.stdDev),
      delta_vs_baseline: `${delta >= 0 ? '+' : ''}${delta.toFixed(2)}%`,
    };
  });

  console.table(rows);
}

const args = parseArgs(process.argv.slice(2));

const corpus = buildCorpus({
  decls: args.decls,
  seed: args.seed,
  selectors: args.selectors,
});

const rhythmguardConfig = {
  plugins: [path.join(repoRoot, 'src', 'index.js')],
  rules: {
    'rhythmguard/use-scale': [
      true,
      {
        allowPercentages: true,
        properties: SHARED_PROPERTIES,
        scale: SHARED_SCALE,
        units: ['px'],
      },
    ],
  },
};

const scalesConfig = {
  plugins: ['stylelint-scales'],
  rules: {
    'scales/space': [
      {
        scale: SHARED_SCALE,
        units: ['px'],
      },
    ],
  },
};

const results = [];

results.push(
  await runCase({
    code: corpus,
    config: scalesConfig,
    fix: args.fix,
    iterations: args.iterations,
    name: 'stylelint-scales:space',
    warmup: args.warmup,
  }),
);

results.push(
  await runCase({
    code: corpus,
    config: rhythmguardConfig,
    fix: args.fix,
    iterations: args.iterations,
    name: 'rhythmguard:use-scale',
    warmup: args.warmup,
  }),
);

const output = {
  benchmark: 'spacing-scale-lint',
  corpus: {
    declarationsPerSelector: args.decls,
    selectors: args.selectors,
    seed: args.seed,
  },
  environment: {
    node: process.version,
    platform: process.platform,
  },
  fix: args.fix,
  iterations: args.iterations,
  timestamp: new Date().toISOString(),
  warmup: args.warmup,
  results,
};

await fs.mkdir(outputDir, { recursive: true });
await fs.writeFile(outputFile, `${JSON.stringify(output, null, 2)}\n`, 'utf8');

console.log('');
console.log('Rhythmguard benchmark complete');
console.log(
  `Corpus: ${args.selectors} selectors, ${args.decls} declarations/selector, ${args.selectors * args.decls} declarations total`,
);
console.log(`Mode: ${args.fix ? 'fix on' : 'fix off'}`);
console.log(`Iterations: ${args.iterations} (warmup ${args.warmup})`);
console.log(`Saved: ${outputFile}`);
console.log('');
printResultRows(results, 'stylelint-scales:space');
