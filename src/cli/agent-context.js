'use strict';

/**
 * The project section `init --agents agents` and `init --agents claude-md`
 * write into AGENTS.md and CLAUDE.md, and the hash `rhythmguard doctor` checks
 * it against (ai-07). The scale comes from `rhythmguard scale`'s own resolver,
 * so the section names the scale the audit command in it checks. Nothing here
 * loads a Tailwind config or any other project code: a Tailwind v3 config is
 * named in the command, never read (SECURITY.md).
 */
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const { auditCommand } = require('../audit/next-steps');
const { formatLength } = require('../core/length');
const { RC_FILE, findTailwindConfig, findTokenFiles, readPackage, tailwindMajor, toPosix } = require('./first-run');

const BLOCK_START = '<!-- rhythmguard:agents:start -->';
const BLOCK_END = '<!-- rhythmguard:agents:end -->';
const HASH_PATTERN = /<!-- rhythmguard:scale-hash ([0-9a-f]{12}) -->/;
// Files the block targets write, by target name.
const BLOCK_FILES = Object.freeze({ agents: 'AGENTS.md', 'claude-md': 'CLAUDE.md' });

/** Run `fn` with `cwd` as the working directory: the audit's resolver reads process.cwd(). */
function withCwd(cwd, fn) {
  const previous = process.cwd();
  if (path.resolve(cwd) === previous) {
    return fn();
  }
  process.chdir(cwd);
  try {
    return fn();
  } finally {
    process.chdir(previous);
  }
}

function readRc(cwd) {
  const file = path.join(cwd, RC_FILE);
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    // An rc that does not parse names no scale; the audit itself reports it.
    return { invalid: String(error.message) };
  }
}

/** An rc that names its own scale: `--scale auto` on the command line would override it. */
function rcSetsScale(rc) {
  const audit = rc && rc.audit;
  if (!audit) return false;
  if (audit.scales && audit.scales.spacing) return true;
  return audit.scale !== undefined && audit.scale !== 'auto';
}

function hasPackage(cwd, pkg, name) {
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };
  return Boolean(deps[name]) || fs.existsSync(path.join(cwd, 'node_modules', name, 'package.json'));
}

/**
 * The audit options and the command that reproduce them. With an rc, its
 * token sources apply and the command stays the plain one (which the Claude
 * Code skill pre-approves); without one, the token files the quickstart finds
 * are passed as flags, as the quickstart's own commands do.
 */
function auditPlan(cwd) {
  const rc = readRc(cwd);
  const rcPresent = fs.existsSync(path.join(cwd, RC_FILE));
  const explicit = rcSetsScale(rc);
  const pkg = readPackage(cwd);
  const major = tailwindMajor(pkg);
  const tailwindConfig = major !== null && major < 4 ? findTailwindConfig(cwd) : null;
  const tokenSources = rcPresent ? [] : findTokenFiles(cwd).map(toPosix);
  const options = { dir: '.', ...(explicit ? {} : { scale: 'auto' }), ...(tokenSources.length > 0 ? { tokenSources } : {}) };
  const command = `${auditCommand({ dir: '.', scale: explicit ? null : 'auto', tailwindConfig: tailwindConfig ? toPosix(tailwindConfig) : null, tokenSources })} --format json`;
  return { command, options, pkg, rcPresent, tailwindConfig };
}

/** The part of a scale report the section shows, and so the part its hash covers. */
function scaleFingerprint(report) {
  return {
    classStrings: report.scale.classStrings ? report.scale.classStrings.name : null,
    files: report.scale.files,
    source: report.scale.source,
    steps: report.steps.map((step) => [step.value, step.tokens.map((entry) => entry.token)]),
    values: report.scale.values,
  };
}

function scaleHash(report) {
  return crypto.createHash('sha256').update(JSON.stringify(scaleFingerprint(report))).digest('hex').slice(0, 12);
}

function label(value) {
  return typeof value === 'number' ? formatLength(value, 'px') : String(value);
}

const SOURCE_TEXT = Object.freeze({
  default: 'the built-in default scale',
  explicit: 'set in .rhythmguardrc.json',
  fallback: 'no spacing tokens found, so the fallback scale',
  'scanned-css': 'spacing tokens in the stylesheets',
  tailwind: 'the Tailwind config',
  'token-package': 'an installed design-token package',
  'token-sources': 'the token files',
});

/**
 * The scale, its source, the token per step and the audit command for the
 * project in `cwd`, plus the hash of the scale part. Resolved as
 * `rhythmguard scale` resolves it; no project code runs.
 */
function projectContext(cwd = process.cwd()) {
  const root = path.resolve(cwd);
  const plan = auditPlan(root);
  // Loaded here, not at the top: `rhythmguard scale` pulls in the audit's argument table.
  const { resolveScaleReport } = require('./scale');
  const report = withCwd(root, () => resolveScaleReport(plan.options));
  return {
    command: plan.command,
    eslint: hasPackage(root, plan.pkg, 'eslint') || hasPackage(root, plan.pkg, 'eslint-plugin-rhythmguard'),
    hash: scaleHash(report),
    rcPresent: plan.rcPresent,
    report,
    stylelint: hasPackage(root, plan.pkg, 'stylelint'),
    tailwindConfig: plan.tailwindConfig,
  };
}

/** The "### This project" section, with the hash marker doctor reads. */
function projectSection(context, target) {
  const { report } = context;
  const { scale } = report;
  const files = scale.files.length > 0 ? ` (${scale.files.map((file) => `\`${file}\``).join(', ')})` : '';
  const withTokens = report.steps.filter((step) => step.tokens.length > 0);
  const lines = [
    '### This project',
    '',
    `<!-- rhythmguard:scale-hash ${context.hash} -->`,
    `Written by \`npx rhythmguard init --agents ${target}\` from this project's files. \`npx rhythmguard doctor\` warns when the scale below no longer matches them; rerun that command to refresh this section.`,
    '',
    `- Audit command: \`${context.command}\``,
    `- Scale: ${scale.values.map(label).join(', ')}`,
    `- Source: \`${scale.source}\`, ${SOURCE_TEXT[scale.source] || scale.source}${files}.`,
  ];
  if (withTokens.length > 0) {
    lines.push(`- Token per step: ${withTokens.map((step) => `${label(step.value)} \`var(${step.tokens[0].token})\`${step.tokens.length > 1 ? ` (or ${step.tokens.slice(1).map((entry) => `\`var(${entry.token})\``).join(', ')})` : ''}`).join(', ')}.`);
  } else {
    lines.push('- Token per step: none of these steps has a token. Write the value or the Tailwind utility; never invent a token name.');
  }
  if (scale.classStrings) {
    const same = scale.classStrings.values.join() === scale.values.join();
    lines.push(`- Class strings are checked against ${scale.classStrings.name}${same ? ', the same steps' : ', not the scale above'}; a finding names the two utility classes to choose from.`);
  }
  if (context.tailwindConfig) {
    lines.push(`- The scale above was computed without loading \`${toPosix(context.tailwindConfig)}\`: Rhythmguard runs a Tailwind config only when a command names it, as the audit command above does.`);
  }
  if (!context.stylelint) {
    lines.push(`- Stylelint is not installed: the audit reads class strings only and lists the stylesheets it skipped.${context.eslint ? ' Run `npx eslint .` for the class-string findings.' : ''}`);
  }
  if (!context.rcPresent && /--token-source/.test(context.command)) {
    lines.push(`- \`npx rhythmguard init\` can write a ${RC_FILE} that names these token files, so the plain \`npx rhythmguard audit . --scale auto --format json\` reads them too.`);
  }
  return lines.join('\n');
}

/** The whole marked block: the FOR_AGENTS.md block, then the project section. */
function agentsBlock(genericBlock, context, target) {
  return [BLOCK_START, genericBlock.trimEnd(), '', projectSection(context, target), BLOCK_END].join('\n');
}

/**
 * `existing` with the Rhythmguard block replaced, or appended when there is
 * none. Everything outside the markers is kept byte for byte.
 */
function mergeBlock(existing, block) {
  if (existing === null || existing === undefined || existing === '') {
    return { action: 'created', text: `${block}\n` };
  }
  const start = existing.indexOf(BLOCK_START);
  const end = existing.indexOf(BLOCK_END, start === -1 ? 0 : start);
  if (start !== -1 && end !== -1) {
    return { action: 'updated', text: `${existing.slice(0, start)}${block}${existing.slice(end + BLOCK_END.length)}` };
  }
  const separator = existing.endsWith('\n\n') ? '' : existing.endsWith('\n') ? '\n' : '\n\n';
  return { action: 'added', text: `${existing}${separator}${block}\n` };
}

/** The hash in a file's Rhythmguard block, or null when it has none. */
function blockHash(text) {
  const start = text.indexOf(BLOCK_START);
  const end = text.indexOf(BLOCK_END, start === -1 ? 0 : start);
  if (start === -1 || end === -1) return null;
  const match = text.slice(start, end).match(HASH_PATTERN);
  return match ? match[1] : null;
}

module.exports = {
  BLOCK_END,
  BLOCK_FILES,
  BLOCK_START,
  agentsBlock,
  blockHash,
  mergeBlock,
  projectContext,
  projectSection,
  scaleHash,
};
