'use strict';

const {
  normalizeTokenKind,
  normalizeTokenSourceFormat,
} = require('../core/token-sources');
const { BADGE_METRICS } = require('./render-badge');
const {
  VALID_FORMATS,
  createDefaultAuditOptions,
  normalizeIgnorePattern,
} = require('./shared');

/**
 * Every audit flag is one entry here. `kind` says whether the flag takes a
 * value (`value`), may take one (`optional`: the next argument is consumed
 * unless it starts with a dash), or is a switch (`flag`). `apply` writes the
 * parsed result; `cliOptions` records which keys the command line set so the
 * config file loader can tell an explicit value from a default. The help text
 * is rendered from this table, so a flag cannot exist without documentation.
 */
const setFrom = (parsed, key) => parsed.cliOptions.add(key);

const OPTIONS = [
  { flag: '--format', kind: 'value', value: '<text|json|json-v1|markdown|html|github|badge>', help: ['Output format (default: text)', 'github = GitHub Actions workflow-command annotations', 'badge = shields.io endpoint JSON for a README badge'],
    apply: (p, raw) => { p.format = String(raw || '').toLowerCase(); } },
  { flag: '--badge-metric', kind: 'value', value: '<drift|findings>', help: 'Badge value: drift percent or off-scale count (default: drift)',
    apply: (p, raw) => { p.badgeMetric = String(raw || '').toLowerCase(); } },
  { flag: '--json', kind: 'flag', help: 'Alias for --format json', apply: (p) => { p.format = 'json'; } },
  { flag: '--markdown', kind: 'flag', help: 'Alias for --format markdown', apply: (p) => { p.format = 'markdown'; } },
  { flag: '--schema', kind: 'flag', help: 'Print the audit JSON schema and exit', apply: (p) => { p.schema = true; p.format = 'json'; } },
  { flag: '--output', kind: 'value', value: '<file>', help: 'Write json, markdown, html or badge output to a file',
    apply: (p, raw) => { p.outputPath = parsePathOption(raw, '--output'); setFrom(p, 'outputPath'); } },
  { flag: '--config', kind: 'value', value: '<file>', help: 'Load audit config (default: .rhythmguardrc.json when present)',
    apply: (p, raw) => { p.configPath = parsePathOption(raw, '--config'); p.configExplicit = true; } },
  { flag: '--no-config', kind: 'flag', help: 'Ignore .rhythmguardrc.json discovery', apply: (p) => { p.noConfig = true; } },
  { flag: '--ignore', kind: 'value', value: '<pattern>', help: 'Exclude root-relative path/glob (repeatable, comma-separated)',
    apply: (p, raw) => { p.ignorePatterns.push(...parseIgnorePatterns(raw)); setFrom(p, 'ignore'); } },
  { flag: '--ignore-path', kind: 'value', value: '<file>', help: 'Load ignore patterns from file (default: .rhythmguardignore when present)',
    apply: (p, raw) => { p.ignorePath = parsePathOption(raw, '--ignore-path'); setFrom(p, 'ignorePath'); } },
  { flag: '--baseline', kind: 'value', value: '<file>', help: 'Baseline file path (default: .rhythmguard-baseline.json)',
    apply: (p, raw) => { p.baselinePath = parsePathOption(raw, '--baseline'); setFrom(p, 'baselinePath'); } },
  { flag: '--write-baseline', kind: 'optional', value: '[file]', help: 'Write current findings as a baseline',
    apply: (p, raw) => { p.writeBaseline = true; setFrom(p, 'writeBaseline'); if (raw !== undefined) { p.baselinePath = parsePathOption(raw, '--write-baseline'); setFrom(p, 'baselinePath'); } } },
  { flag: '--since-baseline', kind: 'optional', value: '[file]', help: 'Compare current findings against a baseline',
    apply: (p, raw) => { p.sinceBaseline = true; setFrom(p, 'sinceBaseline'); if (raw !== undefined) { p.baselinePath = parsePathOption(raw, '--since-baseline'); setFrom(p, 'baselinePath'); } } },
  { flag: '--fail-on-new-drift', kind: 'flag', help: 'Exit 1 when --since-baseline finds new drift',
    apply: (p) => { p.failOnNewDrift = true; setFrom(p, 'failOnNewDrift'); } },
  { flag: '--max-findings', kind: 'value', value: '<number>', help: 'Exit 1 when total findings exceed this count',
    apply: (p, raw) => { p.maxFindings = parseNonNegativeInteger(raw, '--max-findings'); setFrom(p, 'maxFindings'); } },
  { flag: '--min-cleanliness', kind: 'value', value: '<percent>', help: 'Exit 1 when scale cleanliness is lower than this percent',
    apply: (p, raw) => { p.minCleanliness = parsePercentage(raw, '--min-cleanliness'); setFrom(p, 'minCleanliness'); } },
  { flag: '--since', kind: 'value', value: '<git-ref>', help: 'Scan only changed files since a git ref',
    apply: (p, raw) => { p.since = parsePathOption(raw, '--since'); setFrom(p, 'since'); } },
  { flag: '--staged', kind: 'flag', help: 'Scan only staged files', apply: (p) => { p.staged = true; setFrom(p, 'staged'); } },
  { flag: '--include-motion', kind: 'flag', help: 'Include opt-in motion duration/easing drift',
    apply: (p) => { p.includeMotion = true; setFrom(p, 'includeMotion'); } },
  { flag: '--token-source', kind: 'value', value: '<file>', help: 'External token source (repeatable, comma-separated)',
    apply: (p, raw) => { p.tokenSources.push(...parseTokenSourcePaths(raw)); setFrom(p, 'tokenSources'); } },
  { flag: '--token-source-format', kind: 'value', value: '<format>', help: 'Token source format: auto, css, flat-json, style-dictionary, dtcg (default: auto)',
    apply: (p, raw) => { p.tokenSourceFormat = normalizeTokenSourceFormat(raw); setFrom(p, 'tokenSourceFormat'); } },
  { flag: '--token-kind', kind: 'value', value: '<kind>', help: 'Token kind: spacing, radius, typography, size, motion, all (default: spacing)',
    apply: (p, raw) => { p.tokenKind = normalizeTokenKind(raw); setFrom(p, 'tokenKind'); } },
  { flag: '--token-candidate-min-count', kind: 'value', value: '<n>', help: 'Minimum repeated raw value count for token candidates (default: 2)',
    apply: (p, raw) => { p.tokenCandidateMinCount = parsePositiveInteger(raw, '--token-candidate-min-count'); setFrom(p, 'tokenCandidateMinCount'); } },
  { flag: '--scale', kind: 'value', value: '<values|auto>', help: ['Comma-separated scale values (default: 0,4,8,12,16,24,32);', 'auto infers the scale from token sources, then --space-*/--spacing-*', 'custom properties and Sass variables in scanned CSS/SCSS, then', 'installed design-token packages, and reports where it came from'],
    apply: (p, raw) => { p.scale = parseScale(raw); setFrom(p, 'scale'); } },
  { flag: '--base-font-size', kind: 'value', value: '<number>', help: 'px base for rem/em conversion (default: 16)',
    apply: (p, raw) => { p.baseFontSize = parseBaseFontSize(raw); setFrom(p, 'baseFontSize'); } },
  { flag: '--help', alias: '-h', kind: 'flag', help: 'Show this help message', apply: (p) => { p.help = true; } },
];

const HELP_COLUMN = 33;

function renderHelp() {
  const lines = ['Usage: rhythmguard audit <dir> [options]', '', 'Options:'];
  for (const option of OPTIONS) {
    const label = `  ${option.flag}${option.value ? ` ${option.value}` : ''}`;
    const help = Array.isArray(option.help) ? option.help : [option.help];
    lines.push(`${label.padEnd(HELP_COLUMN)}${label.length >= HELP_COLUMN ? ' ' : ''}${help[0]}`);
    for (const extra of help.slice(1)) {
      lines.push(`${''.padEnd(HELP_COLUMN)}${extra}`);
    }
  }
  lines.push(
    '',
    'Scans .css files, and .scss files when postcss-scss is installed. Reports drift by',
    'value, by property and by file; text output prints histograms, markdown is PR-ready,',
    'json is the stable 2.0 contract.',
    '',
  );
  return lines.join('\n');
}

const HELP = renderHelp();

function findOption(arg) {
  return OPTIONS.find((option) => option.flag === arg || option.alias === arg) || null;
}

function parseArgs(argv) {
  const parsed = createDefaultAuditOptions();

  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    const equals = arg.indexOf('=');
    const inline = arg.startsWith('--') && equals !== -1 ? findOption(arg.slice(0, equals)) : null;

    if (inline && inline.kind !== 'flag') {
      inline.apply(parsed, arg.slice(equals + 1));
      continue;
    }

    const option = findOption(arg);
    if (option) {
      if (option.kind === 'flag') {
        option.apply(parsed);
      } else if (option.kind === 'value') {
        option.apply(parsed, argv[++index]);
      } else if (argv[index + 1] !== undefined && !argv[index + 1].startsWith('-')) {
        option.apply(parsed, argv[++index]);
      } else {
        option.apply(parsed, undefined);
      }
      continue;
    }

    if (!arg.startsWith('-') && !parsed.dir) {
      parsed.dir = arg;
      continue;
    }

    throw new Error(`Unknown option: ${arg}`);
  }

  if (!VALID_FORMATS.has(parsed.format)) {
    throw new Error(`Invalid format "${parsed.format}". Expected ${Array.from(VALID_FORMATS).join(', ')}.`);
  }

  if (!BADGE_METRICS.has(parsed.badgeMetric)) {
    throw new Error(`Invalid badge metric "${parsed.badgeMetric}". Expected drift or findings.`);
  }

  if (parsed.since && parsed.staged) {
    throw new Error('Use either --since or --staged, not both.');
  }

  if (parsed.failOnNewDrift && !parsed.sinceBaseline) {
    throw new Error('--fail-on-new-drift requires --since-baseline.');
  }

  return parsed;
}

function parsePathOption(raw, optionName) {
  if (!raw) {
    throw new Error(`Missing value for ${optionName}.`);
  }

  return String(raw);
}

function parseNonNegativeInteger(raw, optionName) {
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${optionName} must be a non-negative integer.`);
  }

  return value;
}

function parsePositiveInteger(raw, optionName) {
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${optionName} must be a positive integer.`);
  }

  return value;
}

function parsePercentage(raw, optionName) {
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0 || value > 100) {
    throw new Error(`${optionName} must be a number between 0 and 100.`);
  }

  return value;
}

function parseIgnorePatterns(raw) {
  if (!raw) {
    throw new Error('Missing value for --ignore.');
  }

  const patterns = String(raw).split(',')
    .map((pattern) => normalizeIgnorePattern(pattern))
    .filter(Boolean);

  if (patterns.length === 0) {
    throw new Error('--ignore must include at least one pattern.');
  }

  return patterns;
}

function parseTokenSourcePaths(raw) {
  if (!raw) {
    throw new Error('Missing value for --token-source.');
  }

  const sources = String(raw).split(',')
    .map((sourcePath) => sourcePath.trim())
    .filter(Boolean);

  if (sources.length === 0) {
    throw new Error('--token-source must include at least one file.');
  }

  return sources;
}


function parseScale(raw) {
  if (!raw) {
    throw new Error('Missing value for --scale.');
  }

  if (raw.trim().toLowerCase() === 'auto') {
    return 'auto';
  }

  const scale = raw.split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const numeric = Number(part);
      return Number.isFinite(numeric) && !/[a-z%]/i.test(part) ? numeric : part;
    });

  if (scale.length === 0) {
    throw new Error('Scale must include at least one value.');
  }

  return scale;
}

function parseBaseFontSize(raw) {
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error('--base-font-size must be a positive number.');
  }

  return value;
}

module.exports = {
  OPTIONS,
  HELP,
  parseArgs,
  parseBaseFontSize,
  parseIgnorePatterns,
  parseNonNegativeInteger,
  parsePathOption,
  parsePercentage,
  parsePositiveInteger,
  parseScale,
  parseTokenSourcePaths,
};
