'use strict';

/**
 * `rhythmguard scale`: the scale the audit would check against, where it came
 * from, and the tokens that hold each step, without scanning for findings
 * (ai-04). It resolves the scale through the audit's own path (flags,
 * `.rhythmguardrc.json`, `--scale auto`), so the two never disagree.
 */
const { OPTIONS, parseArgs, renderOptionLines } = require('../audit/args');
const { normalizeCreateAuditOptions, prepareAuditRun, tokenScaleSources } = require('../audit/report');
const { formatLength, parseLengthToken, toPx } = require('../core/length');
const { discoverTokenPackages } = require('../core/scale-inference');
const { tokenIndexFromDefinitions } = require('../core/token-index');
const { parseTokenSources } = require('../core/token-sources');

const SCALE_FLAGS = new Set([
  '--format',
  '--json',
  '--config',
  '--no-config',
  '--ignore',
  '--ignore-path',
  '--include-non-authored',
  '--token-source',
  '--token-source-format',
  '--scale',
  '--base-font-size',
  '--help',
]);

const SCALE_OPTIONS = OPTIONS
  .filter((option) => SCALE_FLAGS.has(option.flag))
  .map((option) => (option.flag === '--format'
    ? { ...option, value: '<text|json>', help: 'Output format (default: text)' }
    : option));

const SCALE_FORMATS = new Set(['text', 'json']);

const HELP = [
  'Usage: rhythmguard scale [dir] [options]',
  '',
  'Print the spacing scale `rhythmguard audit` would check <dir> against (default: .),',
  'where it came from, and the tokens that hold each step. Resolved as the audit does:',
  '--scale, then .rhythmguardrc.json, then the built-in default; --scale auto infers it',
  'from token sources, then scanned stylesheets, then installed token packages.',
  'Exits 2 when a configured token source does not exist, as the audit does.',
  '',
  'Options:',
  ...renderOptionLines(SCALE_OPTIONS),
  '',
  'Examples:',
  '  npx rhythmguard scale',
  '  npx rhythmguard scale ./src --scale auto --format json',
  '  npx rhythmguard scale --token-source ./tokens/tokens.json --scale auto',
  '',
].join('\n');

const SOURCE_NOTES = Object.freeze({
  default: 'the built-in default; pass --scale auto to infer one from your tokens',
  explicit: 'set by --scale, audit.scale or audit.scales.spacing',
  fallback: 'no tokens found, so the built-in default',
  'scanned-css': 'spacing custom properties and Sass tokens in the scanned stylesheets',
  tailwind: 'the configured Tailwind config',
  'token-package': 'an installed design-token package',
  'token-sources': 'the configured token sources',
});

/** The px value of a scale entry (a number is px; a string is a length), or null. */
function entryPx(entry, baseFontSize) {
  if (typeof entry === 'number') {
    return entry;
  }
  const parsed = parseLengthToken(String(entry));
  return parsed ? toPx(parsed.number, parsed.unit || 'px', baseFontSize) : null;
}

/**
 * The tokens that hold each step: from the token sources, the stylesheets
 * that declare tokens, and installed token packages, the places prefer-token
 * reads in an audit. Only tokens defined everywhere count: one declared in a
 * component block or under a media query does not stand for a step.
 */
function tokensByStep(run, parsed) {
  const entries = tokenScaleSources({
    baseFontSize: parsed.baseFontSize,
    cssFiles: run.cssFiles,
    isNonAuthored: run.isNonAuthored,
    readSource: run.readSource,
    tokenSources: parsed.tokenSources,
  });
  const definitions = parseTokenSources({
    baseFontSize: parsed.baseFontSize,
    sources: [...entries, ...discoverTokenPackages(process.cwd())],
    tokenKind: 'spacing',
  }).definitions;
  const index = tokenIndexFromDefinitions(definitions, parsed.baseFontSize)
    .filter((entry) => entry.token.startsWith('--') && entry.fixScopes.some((scope) => scope.global));

  return run.scale.values.map((value) => {
    const px = entryPx(value, parsed.baseFontSize);
    const seen = new Set();
    const tokens = [];
    for (const entry of index) {
      if (px === null || Math.abs(entry.px - px) > 1e-6 || seen.has(entry.token)) {
        continue;
      }
      seen.add(entry.token);
      tokens.push({ file: entry.file, token: entry.token, value: entry.raw });
    }
    tokens.sort((a, b) => a.token.localeCompare(b.token, 'en', { numeric: true }));
    return { px, tokens, value };
  });
}

/** The scale report: what `--format json` prints. */
function resolveScaleReport(parsedArgs) {
  const parsed = normalizeCreateAuditOptions({ ...parsedArgs, dir: parsedArgs.dir || '.' });
  const run = prepareAuditRun(parsed);
  const { scale } = run;
  return {
    baseFontSize: parsed.baseFontSize,
    command: {
      config: parsed.config,
      directory: parsed.dir,
    },
    scale: {
      classStrings: scale.classStrings || null,
      files: scale.files,
      rejected: scale.rejected || null,
      source: scale.source,
      tokenCount: scale.tokenCount,
      values: scale.values,
    },
    schemaVersion: '1.0',
    steps: tokensByStep(run, parsed),
    warnings: run.spacingSourceResult.warnings,
  };
}

function renderScaleText(report) {
  const { scale } = report;
  const files = scale.files.length > 0 ? ` (${scale.files.join(', ')})` : '';
  const lines = [
    '',
    '  Rhythmguard scale',
    '',
    `  Scale          ${scale.values.join(', ')}`,
    `  Source         ${scale.source}${files}: ${SOURCE_NOTES[scale.source] || scale.source}`,
  ];
  if (scale.tokenCount > 0) {
    lines.push(`  Tokens read    ${scale.tokenCount}`);
  }
  if (scale.rejected) {
    lines.push(`  Rejected       ${scale.rejected.source} (${scale.rejected.values.join(', ')}): ${scale.rejected.reasons.join(', ')}`);
  }
  if (scale.classStrings) {
    lines.push(`  Class strings  ${scale.classStrings.name} (${scale.classStrings.values.join(', ')})`);
  }
  lines.push(`  Config         ${report.command.config ? report.command.config.file : 'none'}`);
  lines.push('');
  lines.push('  Steps');
  for (const step of report.steps) {
    const label = typeof step.value === 'number' ? formatLength(step.value, 'px') : String(step.value);
    const tokens = step.tokens.length > 0
      ? step.tokens.map((entry) => `var(${entry.token})${entry.file ? ` ${entry.file}` : ''}`).join(', ')
      : '';
    lines.push(`    ${label.padEnd(10)}${tokens}`.trimEnd());
  }
  if (report.warnings.length > 0) {
    lines.push('');
    for (const warning of report.warnings) {
      lines.push(`  Warning: ${warning}`);
    }
  }
  lines.push('');
  return `${lines.join('\n')}\n`;
}

function run(argv = process.argv.slice(3)) {
  let parsed;
  try {
    parsed = parseArgs(argv, SCALE_OPTIONS);
    if (!SCALE_FORMATS.has(parsed.format)) {
      throw new Error(`Invalid format "${parsed.format}". Expected text or json.`);
    }
  } catch (err) {
    process.stderr.write(`${err.message}\n\n${HELP}`);
    process.exit(1);
  }

  if (parsed.help) {
    process.stdout.write(HELP);
    return;
  }

  let report;
  try {
    report = resolveScaleReport(parsed);
  } catch (err) {
    process.stderr.write(`${err.message}\n`);
    process.exit(1);
  }

  process.stdout.write(parsed.format === 'json' ? `${JSON.stringify(report, null, 2)}\n` : renderScaleText(report));

  const missing = report.warnings.filter((warning) => warning.startsWith('Token source not found:'));
  if (missing.length > 0) {
    process.stderr.write(`${missing.join('\n')}\nA configured token source does not exist, so the scale above is not the one configured. Fix the path in --token-source or audit.tokenSources.\n`);
    process.exitCode = 2;
  }
}

module.exports = {
  HELP,
  SCALE_OPTIONS,
  renderScaleText,
  resolveScaleReport,
  run,
};

if (require.main === module) {
  run();
}
