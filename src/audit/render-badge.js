'use strict';

/**
 * shields.io endpoint badge: https://shields.io/badges/endpoint
 *
 * `drift` reports 100 minus scale cleanliness as a percentage (the share of
 * scanned files with at least one finding). `findings` reports the number of
 * off-scale CSS values plus Tailwind class-string findings.
 */
const BADGE_METRICS = new Set(['drift', 'findings']);

const THRESHOLDS = {
  drift: [[2, 'brightgreen'], [5, 'green'], [15, 'yellow']],
  findings: [[0, 'brightgreen'], [10, 'green'], [50, 'yellow']],
};

function badgeColor(metric, value) {
  for (const [limit, color] of THRESHOLDS[metric]) {
    if (value <= limit) {
      return color;
    }
  }
  return 'orange';
}

function badgeValue(report, metric) {
  if (metric === 'drift') {
    const cleanliness = Number.isFinite(report.scaleCleanliness) ? report.scaleCleanliness : 100;
    return Math.max(0, Math.min(100, 100 - cleanliness));
  }
  const css = (report.findings && report.findings.css) || [];
  const tailwind = (report.findings && report.findings.tailwind) || [];
  return css.filter((finding) => finding.type === 'off-scale').length + tailwind.length;
}

function renderBadge(report, { metric = 'drift' } = {}) {
  if (!BADGE_METRICS.has(metric)) {
    throw new Error(`Unknown badge metric "${metric}". Use one of: ${Array.from(BADGE_METRICS).join(', ')}.`);
  }
  const value = badgeValue(report, metric);
  const badge = {
    schemaVersion: 1,
    label: metric === 'drift' ? 'spacing drift' : 'off-scale values',
    message: metric === 'drift' ? `${value}%` : String(value),
    color: badgeColor(metric, value),
  };
  return `${JSON.stringify(badge, null, 2)}\n`;
}

module.exports = {
  BADGE_METRICS,
  badgeColor,
  renderBadge,
};
