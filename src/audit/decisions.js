'use strict';

const { decisionFor } = require('../core/decisions');
const { formatLength, nearestScaleValues, parseLengthToken, toPx } = require('../core/length');

/**
 * Decisions applied to audit findings, and the plan that proposes them.
 * Adopted and allowed values are removed from the findings; snap and undecided
 * ones stay. The plan lists every off-scale value seen, keeping decisions
 * already written and adding `undecided` entries for the rest.
 */
function findingPx(finding, baseFontSize) {
  const raw = finding.value || finding.rawValue;
  const parsed = typeof raw === 'string' ? parseLengthToken(raw.trim()) : null;
  return parsed ? toPx(Math.abs(parsed.number), parsed.unit || 'px', baseFontSize) : null;
}

function findingProperty(finding) {
  return finding.property || (finding.token ? 'class-string' : null);
}

function applyDecisions({ baseFontSize, cssFindings, decisions, tailwindFindings }) {
  if (!decisions || decisions.length === 0) {
    return { cssFindings, suppressed: 0, summary: null, tailwindFindings };
  }
  let suppressed = 0;
  const keep = (finding) => {
    if (finding.type !== 'off-scale' && !finding.token) {
      return true;
    }
    const px = findingPx(finding, baseFontSize);
    const decision = px === null ? null : decisionFor(px, findingProperty(finding), decisions);
    if (decision && (decision.decision === 'adopt' || decision.decision === 'allow')) {
      suppressed += 1;
      return false;
    }
    return true;
  };
  const nextCss = cssFindings.filter(keep);
  const nextTailwind = tailwindFindings.filter(keep);
  const summary = { adopt: 0, allow: 0, snap: 0, undecided: 0 };
  for (const decision of decisions) summary[decision.decision] += 1;
  return { cssFindings: nextCss, suppressed, summary: { ...summary, suppressed }, tailwindFindings: nextTailwind };
}

/**
 * One proposed entry per distinct off-scale px value: the most common spelling,
 * how often it occurs, the properties it sits on, the two nearest scale steps,
 * and the decision so far (`undecided` for anything nobody has looked at).
 */
function buildDecisionPlan({ baseFontSize, decisions, offScaleFindings, scale }) {
  const groups = new Map();
  for (const finding of offScaleFindings) {
    const px = findingPx(finding, baseFontSize);
    if (px === null) continue;
    const key = String(px);
    const group = groups.get(key) || { count: 0, properties: new Map(), px, spellings: new Map() };
    group.count += 1;
    const spelling = (finding.value || finding.rawValue).trim();
    group.spellings.set(spelling, (group.spellings.get(spelling) || 0) + 1);
    const property = findingProperty(finding);
    if (property) group.properties.set(property, (group.properties.get(property) || 0) + 1);
    groups.set(key, group);
  }

  const mostCommon = (map) => [...map.entries()].sort((a, b) => b[1] - a[1]).map(([name]) => name);
  const scalePx = Array.isArray(scale) ? scale.map(Number).filter(Number.isFinite) : [];
  const nearestFor = (px) => {
    const nearest = nearestScaleValues(px, scalePx);
    return nearest ? [formatLength(nearest.lower, 'px'), formatLength(nearest.upper, 'px')] : [];
  };

  const entries = [];
  const decided = new Set();
  for (const decision of decisions || []) {
    const group = groups.get(String(decision.px));
    decided.add(String(decision.px));
    entries.push({
      value: decision.value,
      decision: decision.decision,
      ...(decision.as ? { as: decision.as } : {}),
      ...(decision.reason ? { reason: decision.reason } : {}),
      ...(decision.properties ? { properties: decision.properties } : {}),
      count: group ? group.count : 0,
      nearest: nearestFor(decision.px),
    });
  }
  for (const [key, group] of groups) {
    if (decided.has(key)) continue;
    entries.push({
      value: mostCommon(group.spellings)[0],
      decision: 'undecided',
      count: group.count,
      properties: mostCommon(group.properties).slice(0, 3),
      nearest: nearestFor(group.px),
    });
  }
  entries.sort((a, b) => b.count - a.count || String(a.value).localeCompare(String(b.value)));
  return entries;
}

module.exports = {
  applyDecisions,
  buildDecisionPlan,
};
