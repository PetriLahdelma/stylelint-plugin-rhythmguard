'use strict';

const {
  normalizeTokenKind,
  normalizeTokenSourceFormat,
} = require('../utils/token-sources');
const {
  VALID_FORMATS,
  createDefaultAuditOptions,
  normalizeIgnorePattern,
} = require('./shared');

const HELP = `Usage: rhythmguard audit <dir> [options]

Options:
  --format <text|json|json-v1|markdown|html|github> Output format (default: text)
                                 github = GitHub Actions workflow-command annotations
  --json                         Alias for --format json
  --markdown                     Alias for --format markdown
  --schema                       Print the audit JSON schema and exit
  --output <file>                Write json, markdown, or html output to a file
  --config <file>                Load audit config (default: .rhythmguardrc.json when present)
  --no-config                    Ignore .rhythmguardrc.json discovery
  --ignore <pattern>             Exclude root-relative path/glob (repeatable, comma-separated)
  --ignore-path <file>           Load ignore patterns from file (default: .rhythmguardignore when present)
  --baseline <file>              Baseline file path (default: .rhythmguard-baseline.json)
  --write-baseline [file]        Write current findings as a baseline
  --since-baseline [file]        Compare current findings against a baseline
  --fail-on-new-drift            Exit 1 when --since-baseline finds new drift
  --max-findings <number>        Exit 1 when total findings exceed this count
  --min-cleanliness <percent>    Exit 1 when scale cleanliness is lower than this percent
  --since <git-ref>              Scan only changed files since a git ref
  --staged                       Scan only staged files
  --include-motion               Include opt-in motion duration/easing drift
  --token-source <file>          External token source (repeatable, comma-separated)
  --token-source-format <format> Token source format: auto, css, flat-json, style-dictionary, dtcg (default: auto)
  --token-kind <kind>            Token kind: spacing, radius, typography, size, motion, all (default: spacing)
  --token-candidate-min-count <n> Minimum repeated raw value count for token candidates (default: 2)
  --scale <values|auto>          Comma-separated scale values (default: 0,4,8,12,16,24,32);
                                 auto infers the scale from token sources, then scanned CSS
  --base-font-size <number>      px base for rem/em conversion (default: 16)
`;

function parseArgs(argv) {
  const parsed = createDefaultAuditOptions();

  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];

    if (arg === '--help' || arg === '-h') {
      parsed.help = true;
      continue;
    }

    if (arg === '--schema') {
      parsed.schema = true;
      parsed.format = 'json';
      continue;
    }

    if (arg === '--json') {
      parsed.format = 'json';
      continue;
    }

    if (arg === '--markdown') {
      parsed.format = 'markdown';
      continue;
    }

    if (arg === '--output') {
      parsed.outputPath = parsePathOption(argv[++index], '--output');
      parsed.cliOptions.add('outputPath');
      continue;
    }

    if (arg.startsWith('--output=')) {
      parsed.outputPath = parsePathOption(arg.slice('--output='.length), '--output');
      parsed.cliOptions.add('outputPath');
      continue;
    }

    if (arg === '--ignore') {
      parsed.ignorePatterns.push(...parseIgnorePatterns(argv[++index]));
      parsed.cliOptions.add('ignore');
      continue;
    }

    if (arg.startsWith('--ignore=')) {
      parsed.ignorePatterns.push(...parseIgnorePatterns(arg.slice('--ignore='.length)));
      parsed.cliOptions.add('ignore');
      continue;
    }

    if (arg === '--config') {
      parsed.configPath = parsePathOption(argv[++index], '--config');
      parsed.configExplicit = true;
      continue;
    }

    if (arg.startsWith('--config=')) {
      parsed.configPath = parsePathOption(arg.slice('--config='.length), '--config');
      parsed.configExplicit = true;
      continue;
    }

    if (arg === '--no-config') {
      parsed.noConfig = true;
      continue;
    }

    if (arg === '--ignore-path') {
      parsed.ignorePath = parsePathOption(argv[++index], '--ignore-path');
      parsed.cliOptions.add('ignorePath');
      continue;
    }

    if (arg.startsWith('--ignore-path=')) {
      parsed.ignorePath = parsePathOption(arg.slice('--ignore-path='.length), '--ignore-path');
      parsed.cliOptions.add('ignorePath');
      continue;
    }

    if (arg === '--baseline') {
      parsed.baselinePath = parsePathOption(argv[++index], '--baseline');
      parsed.cliOptions.add('baselinePath');
      continue;
    }

    if (arg.startsWith('--baseline=')) {
      parsed.baselinePath = parsePathOption(arg.slice('--baseline='.length), '--baseline');
      parsed.cliOptions.add('baselinePath');
      continue;
    }

    if (arg === '--write-baseline') {
      parsed.writeBaseline = true;
      parsed.cliOptions.add('writeBaseline');
      if (argv[index + 1] && !argv[index + 1].startsWith('-')) {
        parsed.baselinePath = parsePathOption(argv[++index], '--write-baseline');
        parsed.cliOptions.add('baselinePath');
      }
      continue;
    }

    if (arg.startsWith('--write-baseline=')) {
      parsed.writeBaseline = true;
      parsed.baselinePath = parsePathOption(arg.slice('--write-baseline='.length), '--write-baseline');
      parsed.cliOptions.add('writeBaseline');
      parsed.cliOptions.add('baselinePath');
      continue;
    }

    if (arg === '--since-baseline') {
      parsed.sinceBaseline = true;
      parsed.cliOptions.add('sinceBaseline');
      if (argv[index + 1] && !argv[index + 1].startsWith('-')) {
        parsed.baselinePath = parsePathOption(argv[++index], '--since-baseline');
        parsed.cliOptions.add('baselinePath');
      }
      continue;
    }

    if (arg.startsWith('--since-baseline=')) {
      parsed.sinceBaseline = true;
      parsed.baselinePath = parsePathOption(arg.slice('--since-baseline='.length), '--since-baseline');
      parsed.cliOptions.add('sinceBaseline');
      parsed.cliOptions.add('baselinePath');
      continue;
    }

    if (arg === '--fail-on-new-drift') {
      parsed.failOnNewDrift = true;
      parsed.cliOptions.add('failOnNewDrift');
      continue;
    }

    if (arg === '--max-findings') {
      parsed.maxFindings = parseNonNegativeInteger(argv[++index], '--max-findings');
      parsed.cliOptions.add('maxFindings');
      continue;
    }

    if (arg.startsWith('--max-findings=')) {
      parsed.maxFindings = parseNonNegativeInteger(arg.slice('--max-findings='.length), '--max-findings');
      parsed.cliOptions.add('maxFindings');
      continue;
    }

    if (arg === '--min-cleanliness') {
      parsed.minCleanliness = parsePercentage(argv[++index], '--min-cleanliness');
      parsed.cliOptions.add('minCleanliness');
      continue;
    }

    if (arg.startsWith('--min-cleanliness=')) {
      parsed.minCleanliness = parsePercentage(
        arg.slice('--min-cleanliness='.length),
        '--min-cleanliness',
      );
      parsed.cliOptions.add('minCleanliness');
      continue;
    }

    if (arg === '--since') {
      parsed.since = parsePathOption(argv[++index], '--since');
      parsed.cliOptions.add('since');
      continue;
    }

    if (arg.startsWith('--since=')) {
      parsed.since = parsePathOption(arg.slice('--since='.length), '--since');
      parsed.cliOptions.add('since');
      continue;
    }

    if (arg === '--staged') {
      parsed.staged = true;
      parsed.cliOptions.add('staged');
      continue;
    }

    if (arg === '--include-motion') {
      parsed.includeMotion = true;
      parsed.cliOptions.add('includeMotion');
      continue;
    }

    if (arg === '--token-source') {
      parsed.tokenSources.push(...parseTokenSourcePaths(argv[++index]));
      parsed.cliOptions.add('tokenSources');
      continue;
    }

    if (arg.startsWith('--token-source=')) {
      parsed.tokenSources.push(...parseTokenSourcePaths(arg.slice('--token-source='.length)));
      parsed.cliOptions.add('tokenSources');
      continue;
    }

    if (arg === '--token-source-format') {
      parsed.tokenSourceFormat = normalizeTokenSourceFormat(argv[++index]);
      parsed.cliOptions.add('tokenSourceFormat');
      continue;
    }

    if (arg.startsWith('--token-source-format=')) {
      parsed.tokenSourceFormat = normalizeTokenSourceFormat(arg.slice('--token-source-format='.length));
      parsed.cliOptions.add('tokenSourceFormat');
      continue;
    }

    if (arg === '--token-kind') {
      parsed.tokenKind = normalizeTokenKind(argv[++index]);
      parsed.cliOptions.add('tokenKind');
      continue;
    }

    if (arg.startsWith('--token-kind=')) {
      parsed.tokenKind = normalizeTokenKind(arg.slice('--token-kind='.length));
      parsed.cliOptions.add('tokenKind');
      continue;
    }

    if (arg === '--token-candidate-min-count') {
      parsed.tokenCandidateMinCount = parsePositiveInteger(argv[++index], '--token-candidate-min-count');
      parsed.cliOptions.add('tokenCandidateMinCount');
      continue;
    }

    if (arg.startsWith('--token-candidate-min-count=')) {
      parsed.tokenCandidateMinCount = parsePositiveInteger(
        arg.slice('--token-candidate-min-count='.length),
        '--token-candidate-min-count',
      );
      parsed.cliOptions.add('tokenCandidateMinCount');
      continue;
    }

    if (arg === '--format') {
      parsed.format = String(argv[++index] || '').toLowerCase();
      continue;
    }

    if (arg.startsWith('--format=')) {
      parsed.format = arg.slice('--format='.length).toLowerCase();
      continue;
    }

    if (arg === '--scale') {
      parsed.scale = parseScale(argv[++index]);
      parsed.cliOptions.add('scale');
      continue;
    }

    if (arg.startsWith('--scale=')) {
      parsed.scale = parseScale(arg.slice('--scale='.length));
      parsed.cliOptions.add('scale');
      continue;
    }

    if (arg === '--base-font-size') {
      parsed.baseFontSize = parseBaseFontSize(argv[++index]);
      parsed.cliOptions.add('baseFontSize');
      continue;
    }

    if (arg.startsWith('--base-font-size=')) {
      parsed.baseFontSize = parseBaseFontSize(arg.slice('--base-font-size='.length));
      parsed.cliOptions.add('baseFontSize');
      continue;
    }

    if (!arg.startsWith('-') && !parsed.dir) {
      parsed.dir = arg;
      continue;
    }

    throw new Error(`Unknown option: ${arg}`);
  }

  if (!VALID_FORMATS.has(parsed.format)) {
    throw new Error(`Invalid format "${parsed.format}". Expected text, json, json-v1, markdown, html, or github.`);
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
