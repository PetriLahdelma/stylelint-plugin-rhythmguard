'use strict';

const { propertyKindOf } = require('../core/css-vocabulary');
const { decisionFor } = require('../core/decisions');
const { formatLength, nearestScaleValues, normalizeScale, parseLengthToken, toPx } = require('../core/length');

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
 * Which scale a finding was checked against, as use-scale picks it: the
 * `audit.scales` entry for the property's group, else the project scale. The
 * spacing group's entry is already the project scale (report.js). `key` names
 * the group when it has a scale of its own; `scalePx` is null for a group set
 * to "auto", whose scale the rule infers and the audit cannot see (#283).
 */
function createFindingScaleResolver({ baseFontSize, groupScales, scale }) {
  const projectScale = { key: '', scalePx: Array.isArray(scale) ? normalizeScale(scale, baseFontSize) : [] };
  const byGroup = new Map();
  for (const [group, entry] of Object.entries(groupScales || {})) {
    if (group === 'spacing' || !entry) continue;
    byGroup.set(group, { key: group, scalePx: Array.isArray(entry.scale) ? normalizeScale(entry.scale, baseFontSize) : null });
  }
  return (finding) => {
    if (finding.token || !finding.property) return projectScale;
    return byGroup.get(propertyKindOf(finding.property)) || projectScale;
  };
}

/**
 * One proposed entry per distinct off-scale px value: the most common spelling,
 * how often it occurs, the properties it sits on, the two nearest steps of the
 * scale it was checked against, and the decision so far (`undecided` for
 * anything nobody has looked at). A value found in groups with different
 * scales (`15px` as a font size and as a padding) gets one entry per scale.
 */
function buildDecisionPlan({ baseFontSize, decisions, groupScales = {}, offScaleFindings, scale }) {
  const scaleOf = createFindingScaleResolver({ baseFontSize, groupScales, scale });
  const projectScale = scaleOf({});
  const groups = new Map();
  for (const finding of offScaleFindings) {
    const px = findingPx(finding, baseFontSize);
    if (px === null) continue;
    const checkedAgainst = scaleOf(finding);
    const key = `${px}|${checkedAgainst.key}`;
    const group = groups.get(key) || { count: 0, properties: new Map(), px, scale: checkedAgainst, spellings: new Map() };
    group.count += 1;
    const spelling = (finding.value || finding.rawValue).trim();
    group.spellings.set(spelling, (group.spellings.get(spelling) || 0) + 1);
    const property = findingProperty(finding);
    if (property) group.properties.set(property, (group.properties.get(property) || 0) + 1);
    groups.set(key, group);
  }

  const mostCommon = (map) => [...map.entries()].sort((a, b) => b[1] - a[1]).map(([name]) => name);
  const nearestFor = (px, scalePx) => {
    const nearest = scalePx ? nearestScaleValues(px, scalePx) : null;
    return nearest ? [formatLength(nearest.lower, 'px'), formatLength(nearest.upper, 'px')] : [];
  };
  const groupsForPx = (px) => [...groups.values()].filter((group) => group.px === px);

  const entries = [];
  const decided = new Set();
  for (const decision of decisions || []) {
    const found = groupsForPx(decision.px);
    decided.add(decision.px);
    // A decision covers the value on every property it names; its nearest steps
    // come from the one scale its findings were checked against, if just one.
    const scales = [...new Set(found.map((group) => group.scale))];
    entries.push({
      value: decision.value,
      decision: decision.decision,
      ...(decision.as ? { as: decision.as } : {}),
      ...(decision.reason ? { reason: decision.reason } : {}),
      ...(decision.properties ? { properties: decision.properties } : {}),
      count: found.reduce((sum, group) => sum + group.count, 0),
      nearest: nearestFor(decision.px, (scales.length === 1 ? scales[0] : projectScale).scalePx),
    });
  }
  for (const group of groups.values()) {
    if (decided.has(group.px)) continue;
    entries.push({
      value: mostCommon(group.spellings)[0],
      decision: 'undecided',
      count: group.count,
      properties: mostCommon(group.properties).slice(0, 3),
      nearest: nearestFor(group.px, group.scale.scalePx),
    });
  }
  entries.sort((a, b) => b.count - a.count || String(a.value).localeCompare(String(b.value)));
  return entries;
}

module.exports = {
  applyDecisions,
  buildDecisionPlan,
};
