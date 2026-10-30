'use strict';

const { loadRcDecisions } = require('../core/decisions');
const { parseLengthToken, toPx } = require('../core/length');
const { OPTIONS: AUDIT_OPTIONS, parseBaseFontSize } = require('../audit/args');
const { runCodemod } = require('../audit/codemod');
const { resolveIgnorePatterns } = require('../audit/config');
const { normalizeCreateAuditOptions } = require('../audit/report');
const { assertDirectory } = require('../audit/scan/files');
const { DEFAULT_IGNORE_PATH } = require('../audit/shared');

// --ignore, --ignore-path and --include-non-authored are the audit's own flags,
// parsed by the audit's table, so fix skips exactly what the audit skips (#331).
const SHARED_FLAGS = new Set(['--ignore', '--ignore-path', '--include-non-authored']);
const IGNORE_OPTIONS = AUDIT_OPTIONS.filter((option) => SHARED_FLAGS.has(option.flag));

const HELP = `Usage: rhythmguard fix <dir> --value <length> --to <replacement> [options]
       rhythmguard fix <dir> --decided [options]

Replace one spacing literal everywhere it appears on a spacing property, or
execute the snap decisions in .rhythmguardrc.json that name a "to". Matching is
by px, so --value 10px also rewrites 0.625rem. Token definitions, values inside
var()/theme()/token(), and non-spacing properties are never touched. Dry run by
default. Files the audit skips are skipped too: .rhythmguardignore, audit.ignore
in .rhythmguardrc.json, --ignore, generated directories such as node_modules
and dist, and vendored, test, minified and built stylesheets.

Options:
  --value <length>       The literal to replace, for example 10px or 0.625rem
  --to <replacement>     What to write, for example var(--space-sm) or 8px
  --decided              Apply every snap decision that has a "to"
  --properties <list>    Comma-separated property names or prefix-* patterns (default: spacing properties)
  --base-font-size <px>  Base for rem/em conversion (default: 16)
  --ignore <pattern>     Exclude a root-relative path or glob (repeatable, comma-separated)
  --ignore-path <file>   Load ignore patterns from file (default: .rhythmguardignore when present)
  --include-non-authored Rewrite vendored, test, minified and built stylesheets too
  --write                Apply the changes; without it, only list them
  --help                 Show this help message
`;

function parseArgs(argv) {
  const parsed = {
    baseFontSize: 16,
    cliOptions: new Set(),
    decided: false,
    dir: null,
    help: false,
    ignorePath: DEFAULT_IGNORE_PATH,
    ignorePatterns: [],
    includeNonAuthored: false,
    properties: null,
    replacement: null,
    value: null,
    write: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = () => argv[++index];
    const ignoreOption = IGNORE_OPTIONS.find((option) => arg === option.flag || arg.startsWith(`${option.flag}=`));
    if (ignoreOption && ignoreOption.kind === 'flag' && arg === ignoreOption.flag) ignoreOption.apply(parsed);
    else if (ignoreOption && ignoreOption.kind !== 'flag') ignoreOption.apply(parsed, arg === ignoreOption.flag ? next() : arg.slice(ignoreOption.flag.length + 1));
    else if (arg === '--help' || arg === '-h') parsed.help = true;
    else if (arg === '--write') parsed.write = true;
    else if (arg === '--decided') parsed.decided = true;
    else if (arg === '--value') parsed.value = next();
    else if (arg.startsWith('--value=')) parsed.value = arg.slice('--value='.length);
    else if (arg === '--to') parsed.replacement = next();
    else if (arg.startsWith('--to=')) parsed.replacement = arg.slice('--to='.length);
    else if (arg === '--properties') parsed.properties = splitList(next());
    else if (arg.startsWith('--properties=')) parsed.properties = splitList(arg.slice('--properties='.length));
    else if (arg === '--base-font-size') parsed.baseFontSize = parseBaseFontSize(next());
    else if (arg.startsWith('--base-font-size=')) parsed.baseFontSize = parseBaseFontSize(arg.slice('--base-font-size='.length));
    else if (!arg.startsWith('-') && !parsed.dir) parsed.dir = arg;
    else throw new Error(`Unknown option: ${arg}`);
  }
  return parsed;
}

function splitList(raw) {
  return String(raw || '').split(',').map((entry) => entry.trim()).filter(Boolean);
}

function lengthToPx(value, baseFontSize) {
  const parsed = typeof value === 'string' ? parseLengthToken(value.trim()) : null;
  const px = parsed ? toPx(Math.abs(parsed.number), parsed.unit || 'px', baseFontSize) : null;
  if (px === null || !Number.isFinite(px) || px === 0) {
    throw new Error(`--value must be a CSS length such as 10px or 0.625rem, got ${JSON.stringify(value)}.`);
  }
  return px;
}

/**
 * What to skip, loaded exactly as the audit loads it: .rhythmguardrc.json's
 * audit.ignore, audit.ignorePath and audit.includeNonAuthored, the ignore file,
 * then --ignore and --include-non-authored.
 */
function auditSkipOptions(parsed) {
  const options = normalizeCreateAuditOptions({
    cliOptions: parsed.cliOptions,
    dir: parsed.dir,
    ignorePath: parsed.ignorePath,
    ignorePatterns: parsed.ignorePatterns,
    includeNonAuthored: parsed.includeNonAuthored,
  });
  return { ignorePatterns: resolveIgnorePatterns(options), includeNonAuthored: options.includeNonAuthored === true };
}

/** The replacements to run: one from --value/--to, or every snap decision with a "to". */
function plannedReplacements(parsed) {
  if (parsed.decided) {
    const decisions = loadRcDecisions(process.cwd(), { baseFontSize: parsed.baseFontSize });
    const snaps = decisions.filter((decision) => decision.decision === 'snap');
    return {
      replacements: snaps.filter((decision) => decision.to).map((decision) => ({ label: decision.value, px: decision.px, replacement: decision.to })),
      skippedSnaps: snaps.filter((decision) => !decision.to).map((decision) => decision.value),
    };
  }
  if (!parsed.value) {
    throw new Error('Pass --value <length> and --to <replacement>, or --decided.');
  }
  if (!parsed.replacement) {
    throw new Error('--to <replacement> is required with --value.');
  }
  return { replacements: [{ label: parsed.value, px: lengthToPx(parsed.value, parsed.baseFontSize), replacement: parsed.replacement }], skippedSnaps: [] };
}

function run() {
  let parsed;
  try {
    parsed = parseArgs(process.argv.slice(3));
  } catch (error) {
    process.stderr.write(`${error.message}\n\n${HELP}`);
    process.exit(1);
  }
  if (parsed.help) {
    process.stdout.write(HELP);
    return;
  }
  if (!parsed.dir) {
    process.stderr.write(`Pass the directory to rewrite.\n\n${HELP}`);
    process.exit(1);
  }

  let plan;
  let skipOptions;
  try {
    // The same check, and the same message, as the audit: a missing path or a
    // file reads "Directory not found" or "Not a directory", not a stack trace (#288).
    assertDirectory(parsed.dir);
    plan = plannedReplacements(parsed);
    skipOptions = auditSkipOptions(parsed);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exit(1);
  }

  const lines = [];
  let total = 0;
  const touched = new Set();
  // Every replacement in one pass over the original values: a value one snap
  // writes is never snapped again, and the dry run lists exactly what --write writes.
  const outcome = plan.replacements.length === 0
    ? { nonAuthoredSkipped: 0, results: [], skipped: [] }
    : runCodemod({
      baseFontSize: parsed.baseFontSize,
      dir: parsed.dir,
      ignorePatterns: skipOptions.ignorePatterns,
      includeNonAuthored: skipOptions.includeNonAuthored,
      properties: parsed.properties,
      replacements: plan.replacements,
      write: parsed.write,
    });
  for (const result of outcome.results) {
    touched.add(result.file);
    for (const change of result.changes) {
      total += 1;
      lines.push(`  ${result.file}:${change.line}:${change.column}  ${change.property}: ${change.from} -> ${change.to}`);
    }
  }
  const skipped = outcome.skipped;

  if (lines.length > 0) {
    lines.push('');
  }
  const noun = total === 1 ? 'replacement' : 'replacements';
  const files = touched.size === 1 ? 'file' : 'files';
  lines.push(`${total} ${noun} in ${touched.size} ${files}${parsed.write ? '' : ' (dry run; pass --write to apply)'}`);
  if (plan.skippedSnaps.length > 0) {
    const noun2 = plan.skippedSnaps.length === 1 ? 'snap decision has' : 'snap decisions have';
    lines.push(`${plan.skippedSnaps.length} ${noun2} no "to" and ${plan.skippedSnaps.length === 1 ? 'was' : 'were'} skipped: ${plan.skippedSnaps.join(', ')}`);
  }
  if (outcome.nonAuthoredSkipped > 0) {
    const noun3 = outcome.nonAuthoredSkipped === 1 ? 'file' : 'files';
    lines.push(`${outcome.nonAuthoredSkipped} non-authored ${noun3} left alone (vendored, minified or built CSS; --include-non-authored rewrites them)`);
  }
  for (const entry of skipped) {
    lines.push(`skipped ${entry.file}: ${entry.reason}`);
  }
  process.stdout.write(`${lines.join('\n')}\n`);
}

module.exports = { HELP, parseArgs, run };

if (require.main === module) {
  run();
}
