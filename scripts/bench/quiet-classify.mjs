/**
 * Classification for the quiet benchmark.
 *
 * A finding is "drift" unless a heuristic or a per-repo manual label says the
 * scanned repository's maintainer would not accept it as real drift. Anything
 * classified as noise or allowance counts as a false positive for the benchmark.
 */

const FALSE_POSITIVE_PREFIXES = ['noise:', 'allowance:'];

function compilePathRules(rules) {
  return (rules.noisePaths || []).map((rule) => ({
    category: rule.category,
    reason: rule.reason || `path matches ${rule.pattern}`,
    regex: new RegExp(rule.pattern),
  }));
}

function labelKey(finding) {
  return `${finding.file}:${finding.line}`;
}

export function classifyFinding(finding, rules, labels = {}) {
  const manual = labels[labelKey(finding)];
  if (manual && manual.category) {
    return { category: manual.category, reason: manual.reason || 'manual label' };
  }

  for (const pathRule of compilePathRules(rules)) {
    if (pathRule.regex.test(finding.file || '')) {
      return { category: pathRule.category, reason: pathRule.reason };
    }
  }

  const value = String(finding.value || finding.rawValue || '').trim();
  for (const allowance of rules.allowances || []) {
    if ((allowance.values || []).includes(value)) {
      return {
        category: allowance.category,
        reason: allowance.reason || `value ${value} is an accepted allowance`,
      };
    }
  }

  return { category: 'drift', reason: 'off-scale value in authored CSS or class string' };
}

export function isFalsePositive(category) {
  return FALSE_POSITIVE_PREFIXES.some((prefix) => category.startsWith(prefix));
}

export function summarize(classified) {
  const byCategory = {};
  let falsePositives = 0;

  for (const item of classified) {
    byCategory[item.category] = (byCategory[item.category] || 0) + 1;
    if (isFalsePositive(item.category)) {
      falsePositives += 1;
    }
  }

  const total = classified.length;
  const sorted = Object.fromEntries(Object.entries(byCategory).sort(([a], [b]) => a.localeCompare(b)));

  return {
    byCategory: sorted,
    drift: byCategory.drift || 0,
    falsePositiveRate: total === 0 ? 0 : Math.round((falsePositives / total) * 100),
    falsePositives,
    total,
  };
}

/**
 * Snapshot = the part of a benchmark result that must stay stable across runs
 * of the same pinned commit: the finding set, the inferred scale, the counts.
 * Timestamps, examples and paths of the checkout are deliberately excluded.
 */
export function toSnapshot(result) {
  return {
    name: result.name,
    sha: result.sha,
    scale: { source: result.scale.source, values: result.scale.values },
    summary: {
      total: result.summary.total,
      drift: result.summary.drift,
      falsePositives: result.summary.falsePositives,
    },
    findings: (result.classified || [])
      .map((item) => `${item.file}:${item.line}:${item.value || item.rawValue || ''}:${item.category}`)
      .sort(),
  };
}

export function compareSnapshot(before, after) {
  const beforeSet = new Set(before.findings || []);
  const afterSet = new Set(after.findings || []);
  const added = [...afterSet].filter((key) => !beforeSet.has(key)).sort();
  const removed = [...beforeSet].filter((key) => !afterSet.has(key)).sort();
  const scaleChanged = before.scale.source !== after.scale.source
    || JSON.stringify(before.scale.values) !== JSON.stringify(after.scale.values);
  const reasons = [];
  if (before.scale.source !== after.scale.source) {
    reasons.push(`scale source ${before.scale.source} -> ${after.scale.source}`);
  } else if (scaleChanged) {
    reasons.push(`scale values changed (${before.scale.values.length} -> ${after.scale.values.length} entries)`);
  }
  if (added.length > 0) reasons.push(`${added.length} new finding(s)`);
  if (removed.length > 0) reasons.push(`${removed.length} finding(s) gone`);
  return {
    added,
    changed: scaleChanged || added.length > 0 || removed.length > 0,
    reasons,
    removed,
    scaleChanged,
  };
}
