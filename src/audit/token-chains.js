'use strict';

const fs = require('node:fs');
const { formatLength, numbersEqual, parseLengthToken, toPx } = require('../core/length');
const { customPropertyDeclarations, parseTokenValueLength } = require('../core/token-sources');
const { formatPath } = require('./shared');

/**
 * Token chains (issue #110). In a token-layered system the SCSS says
 * `padding: var(--button--padding-x)` and the discipline lives one level up:
 * does every spacing token resolve to the scale? This follows var() references
 * through every custom property declaration the audit can see and classifies
 * each spacing-named token by where its chain ends:
 *
 *   on-scale     every terminal is a length on the scale
 *   off-scale    a terminal is a length off the scale: drift at the token layer
 *   unresolved   the chain reaches a token nobody declares, or a cycle
 *   ambiguous    definitions disagree (themes, media queries) on the length
 *   computed     the value is calc() or otherwise not a plain length or var()
 *   non-length   the value is not a single length (a shorthand, a keyword)
 *
 * A token that is defined several times keeps every definition; the chain
 * reports the set, never a guess.
 */
// `size` counts only as a name prefix (`--size-px--m`, mittwald Flow); anywhere else it is a
// font size or a dimension (`--account-bio-size`, `--circle-size`), not spacing.
const SPACING_TOKEN_NAME = /^--size(?:-|$)|(?:^--|-)(?<!letter-)(?<!word-)(?:space|spacing|spacer|padding|margin|gap|inset)(?:-|$)/i;
const VAR_REFERENCE = /^var\(\s*(--[\w-]+)\s*(?:,\s*([\s\S]+))?\)$/;
const OUTCOMES = ['on-scale', 'off-scale', 'unresolved', 'ambiguous', 'computed', 'non-length'];

function isSpacingTokenName(token) {
  return token.startsWith('--') && SPACING_TOKEN_NAME.test(token);
}

/** Every custom property declaration the audit can see: scanned stylesheets plus external token definitions. */
function collectDeclarations({ cssFiles, externalDefinitions, skipFile = () => false }) {
  const declarations = new Map();
  const add = (token, value) => {
    if (!declarations.has(token)) declarations.set(token, new Set());
    declarations.get(token).add(String(value).trim());
  };
  for (const filePath of cssFiles) {
    if (skipFile(formatPath(filePath))) continue;
    let source;
    try {
      source = fs.readFileSync(filePath, 'utf8');
    } catch {
      continue;
    }
    for (const declaration of customPropertyDeclarations(source)) add(declaration.token, declaration.value);
  }
  for (const definition of (externalDefinitions || new Map()).values()) {
    if (!definition.token.startsWith('--')) continue;
    for (const value of definition.values) add(definition.token, value);
  }
  return declarations;
}

function resolveTokenChains({ baseFontSize = 16, declarations, scale }) {
  const scalePx = (scale || []).map(Number).filter(Number.isFinite);
  const memo = new Map();

  const classifyValue = (raw, stack, via) => {
    const value = String(raw).trim();
    const length = parseTokenValueLength(value) || parseLengthToken(value);
    if (length && !/^var\(/i.test(value)) {
      const px = toPx(Math.abs(length.number), length.unit || 'px', baseFontSize);
      return px === null ? { outcomes: ['non-length'], terminals: [] } : { outcomes: [], terminals: [formatLength(px, 'px')] };
    }
    const reference = value.match(VAR_REFERENCE);
    if (reference) {
      const [, target, fallback] = reference;
      if (declarations.has(target)) {
        via.push(target);
        return resolve(target, stack);
      }
      if (fallback !== undefined) {
        return classifyValue(fallback, stack, via);
      }
      return { outcomes: ['unresolved'], reason: `\`${target}\` is not declared`, terminals: [] };
    }
    if (/var\(|calc\(|clamp\(|min\(|max\(/i.test(value)) {
      return { outcomes: ['computed'], terminals: [] };
    }
    return { outcomes: ['non-length'], terminals: [] };
  };

  const resolve = (token, stack) => {
    if (memo.has(token)) return memo.get(token);
    if (stack.includes(token)) {
      return { outcomes: ['unresolved'], reason: `cycle through \`${stack[stack.length - 1]}\``, terminals: [], via: [] };
    }
    const values = declarations.get(token);
    if (!values) return { outcomes: ['unresolved'], reason: `\`${token}\` is not declared`, terminals: [], via: [] };
    const nextStack = [...stack, token];
    const outcomes = new Set();
    const terminals = new Set();
    const via = [];
    let reason = null;
    for (const raw of values) {
      const result = classifyValue(raw, nextStack, via);
      for (const outcome of result.outcomes) outcomes.add(outcome);
      for (const terminal of result.terminals) terminals.add(terminal);
      if (result.reason && !reason) reason = result.reason;
      if (result.via) via.push(...result.via.filter((name) => !via.includes(name)));
    }
    const result = { outcomes: [...outcomes], reason, terminals: [...terminals], via };
    memo.set(token, result);
    return result;
  };

  const onScale = (terminal) => {
    const parsed = parseLengthToken(terminal);
    return parsed && scalePx.some((step) => numbersEqual(step, parsed.number));
  };

  const entries = [];
  for (const token of [...declarations.keys()].sort()) {
    if (!isSpacingTokenName(token)) continue;
    const result = resolve(token, []);
    let outcome;
    if (result.outcomes.includes('unresolved')) outcome = 'unresolved';
    else if (result.outcomes.includes('computed')) outcome = 'computed';
    else if (result.outcomes.includes('non-length')) outcome = 'non-length';
    else if (result.terminals.length > 1) outcome = 'ambiguous';
    else if (result.terminals.length === 1) outcome = onScale(result.terminals[0]) ? 'on-scale' : 'off-scale';
    else outcome = 'unresolved';
    entries.push({ outcome, reason: result.reason || null, terminals: result.terminals, token, via: result.via });
  }

  const summary = Object.fromEntries([['total', entries.length], ...OUTCOMES.map((outcome) => [outcome, 0])]);
  for (const entry of entries) summary[entry.outcome] += 1;
  return { entries, summary };
}

/** The contract shape: counts for everything, entries only for what needs attention. */
function toChainsContract(chains) {
  const attention = new Set(['off-scale', 'unresolved', 'ambiguous']);
  return {
    entries: chains.entries.filter((entry) => attention.has(entry.outcome)).map((entry) => ({
      outcome: entry.outcome,
      ...(entry.reason ? { reason: entry.reason } : {}),
      terminals: entry.terminals,
      token: entry.token,
      via: entry.via,
    })),
    summary: chains.summary,
  };
}

module.exports = {
  OUTCOMES,
  collectDeclarations,
  isSpacingTokenName,
  resolveTokenChains,
  toChainsContract,
};
