'use strict';

const { loadRcDecisions } = require('../core/decisions');
const { parseLengthToken, toPx } = require('../core/length');
const { runCodemod } = require('../audit/codemod');

const HELP = `Usage: rhythmguard fix <dir> --value <length> --to <replacement> [options]
       rhythmguard fix <dir> --decided [options]

Replace one spacing literal everywhere it appears on a spacing property, or
execute the snap decisions in .rhythmguardrc.json that name a "to". Matching is
by px, so --value 10px also rewrites 0.625rem. Token definitions, values inside
var()/theme()/token(), and non-spacing properties are never touched. Dry run by
default.

Options:
  --value <length>       The literal to replace, for example 10px or 0.625rem
  --to <replacement>     What to write, for example var(--space-sm) or 8px
  --decided              Apply every snap decision that has a "to"
  --properties <list>    Comma-separated property names or prefix-* patterns (default: spacing properties)
  --base-font-size <px>  Base for rem/em conversion (default: 16)
  --write                Apply the changes; without it, only list them
  --help                 Show this help message
`;

function parseArgs(argv) {
  const parsed = { baseFontSize: 16, decided: false, dir: null, help: false, properties: null, replacement: null, value: null, write: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = () => argv[++index];
    if (arg === '--help' || arg === '-h') parsed.help = true;
    else if (arg === '--write') parsed.write = true;
    else if (arg === '--decided') parsed.decided = true;
    else if (arg === '--value') parsed.value = next();
    else if (arg.startsWith('--value=')) parsed.value = arg.slice('--value='.length);
    else if (arg === '--to') parsed.replacement = next();
    else if (arg.startsWith('--to=')) parsed.replacement = arg.slice('--to='.length);
    else if (arg === '--properties') parsed.properties = splitList(next());
    else if (arg.startsWith('--properties=')) parsed.properties = splitList(arg.slice('--properties='.length));
    else if (arg === '--base-font-size') parsed.baseFontSize = Number(next());
    else if (arg.startsWith('--base-font-size=')) parsed.baseFontSize = Number(arg.slice('--base-font-size='.length));
    else if (!arg.startsWith('-') && !parsed.dir) parsed.dir = arg;
    else throw new Error(`Unknown option: ${arg}`);
  }
  if (!Number.isFinite(parsed.baseFontSize) || parsed.baseFontSize <= 0) {
    throw new Error('--base-font-size must be a positive number.');
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
  try {
    plan = plannedReplacements(parsed);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exit(1);
  }

  const lines = [];
  let total = 0;
  const touched = new Set();
  const skipped = [];
  for (const replacement of plan.replacements) {
    const outcome = runCodemod({
      baseFontSize: parsed.baseFontSize,
      dir: parsed.dir,
      properties: parsed.properties,
      px: replacement.px,
      replacement: replacement.replacement,
      write: parsed.write,
    });
    for (const result of outcome.results) {
      touched.add(result.file);
      for (const change of result.changes) {
        total += 1;
        lines.push(`  ${result.file}:${change.line}:${change.column}  ${change.property}: ${change.from} -> ${change.to}`);
      }
    }
    skipped.push(...outcome.skipped);
  }

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
  for (const entry of skipped) {
    lines.push(`skipped ${entry.file}: ${entry.reason}`);
  }
  process.stdout.write(`${lines.join('\n')}\n`);
}

module.exports = { HELP, parseArgs, run };

if (require.main === module) {
  run();
}
