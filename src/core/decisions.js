'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { cachedByFiles } = require('./fs-cache');
const { readJsonFile } = require('./json');
const { numbersEqual, parseLengthToken, toPx } = require('./length');

/**
 * The `decisions` section of .rhythmguardrc.json records what a team decided
 * about each off-scale value the audit found:
 *
 *   adopt      the value is part of the scale (optionally naming the token it
 *              should become); it stops being a finding everywhere
 *   allow      the value is intentional and not rhythm (borders, focus rings);
 *              not a finding, optionally only on some properties
 *   snap       the value is a slip; still a finding, and `rhythmguard fix
 *              --decided` executes it when `to` names the replacement
 *   undecided  recorded, still a finding, counted so the team sees it
 *
 * Decisions are matched by px value, so `10px` and `0.625rem` are one
 * decision. The Stylelint rules and the audit read the same file, so a
 * decision made once holds in the editor, in CI and in the report.
 */
const RC_FILE = '.rhythmguardrc.json';
const DECISIONS = new Set(['adopt', 'allow', 'snap', 'undecided']);

function normalizeDecisions(raw, { baseFontSize = 16 } = {}) {
  if (raw === undefined || raw === null) {
    return [];
  }
  if (!Array.isArray(raw)) {
    throw new Error('Invalid Rhythmguard config: decisions must be an array.');
  }
  return raw.map((entry, index) => normalizeDecision(entry, index, baseFontSize));
}

function normalizeDecision(entry, index, baseFontSize) {
  const where = `decisions[${index}]`;
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
    throw new Error(`Invalid Rhythmguard config: ${where} must be an object.`);
  }
  const parsed = typeof entry.value === 'string' ? parseLengthToken(entry.value.trim()) : null;
  const px = parsed ? toPx(Math.abs(parsed.number), parsed.unit || 'px', baseFontSize) : null;
  if (px === null || !Number.isFinite(px)) {
    throw new Error(`Invalid Rhythmguard config: ${where}.value must be a CSS length such as "10px" or "0.75rem".`);
  }
  if (!DECISIONS.has(entry.decision)) {
    throw new Error(`Invalid Rhythmguard config: ${where}.decision must be one of ${Array.from(DECISIONS).join(', ')}.`);
  }
  if (entry.properties !== undefined && (!Array.isArray(entry.properties) || !entry.properties.every((p) => typeof p === 'string' && p.trim()))) {
    throw new Error(`Invalid Rhythmguard config: ${where}.properties must be an array of property names or patterns such as "border-*".`);
  }
  if (entry.as !== undefined && (typeof entry.as !== 'string' || !/^(?:--|\$)[\w-]+$/.test(entry.as))) {
    throw new Error(`Invalid Rhythmguard config: ${where}.as must be a custom property or Sass variable name such as "--space-2".`);
  }
  if (entry.to !== undefined && (typeof entry.to !== 'string' || !entry.to.trim())) {
    throw new Error(`Invalid Rhythmguard config: ${where}.to must be the replacement text a snap writes, such as "8px" or "var(--space-2)".`);
  }
  if (entry.reason !== undefined && typeof entry.reason !== 'string') {
    throw new Error(`Invalid Rhythmguard config: ${where}.reason must be a string.`);
  }
  return {
    as: entry.as || null,
    decision: entry.decision,
    properties: entry.properties ? entry.properties.map((p) => p.trim().toLowerCase()) : null,
    px,
    reason: entry.reason || null,
    to: entry.to ? entry.to.trim() : null,
    value: entry.value.trim(),
  };
}

function propertyMatchesPattern(prop, pattern) {
  if (pattern.endsWith('*')) {
    return prop.startsWith(pattern.slice(0, -1));
  }
  return prop === pattern;
}

/** The decision that applies to a value (in px) on a property, or null. */
function decisionFor(px, prop, decisions) {
  if (!decisions || decisions.length === 0) {
    return null;
  }
  const normalizedProp = String(prop || '').toLowerCase();
  for (const decision of decisions) {
    if (!numbersEqual(decision.px, Math.abs(px))) {
      continue;
    }
    if (decision.properties && !decision.properties.some((pattern) => propertyMatchesPattern(normalizedProp, pattern))) {
      continue;
    }
    return decision;
  }
  return null;
}

/** Decisions from the .rhythmguardrc.json in cwd, cached and revalidated by mtime. Invalid entries throw. */
/** The rc decisions and why they could not be read, cached on the rc file. */
function readRcDecisions(cwd, baseFontSize) {
  const rcPath = path.join(cwd, RC_FILE);
  return cachedByFiles(`decisions:${rcPath}:${baseFontSize}`, (consult) => {
    consult(rcPath);
    if (!fs.existsSync(rcPath)) {
      return { decisions: [], warnings: [] };
    }
    let config;
    try {
      config = readJsonFile(rcPath);
    } catch (error) {
      // A malformed rc loses its adopt and allow decisions: say so (cq-05).
      return { decisions: [], warnings: [`${RC_FILE} could not be read, so its decisions are not applied: ${error.message}`] };
    }
    // An invalid decisions section throws, and the rules report it as a problem.
    return { decisions: normalizeDecisions(config && typeof config === 'object' ? config.decisions : undefined, { baseFontSize }), warnings: [] };
  });
}

function loadRcDecisions(cwd = process.cwd(), { baseFontSize = 16 } = {}) {
  return readRcDecisions(cwd, baseFontSize).decisions;
}

/** Why the rc decisions were not applied, for the lint note; empty when they were. */
function loadRcDecisionWarnings(cwd = process.cwd(), { baseFontSize = 16 } = {}) {
  return readRcDecisions(cwd, baseFontSize).warnings;
}

module.exports = {
  DECISIONS,
  decisionFor,
  loadRcDecisionWarnings,
  loadRcDecisions,
  normalizeDecisions,
};
