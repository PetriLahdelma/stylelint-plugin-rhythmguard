'use strict';

function histBar(count, maxCount) {
  const width = 30;
  const filled = Math.round((count / maxCount) * width);
  return '█'.repeat(filled) + '░'.repeat(width - filled);
}

function scoreBar(pct) {
  const width = 20;
  const filled = Math.round((pct / 100) * width);
  return '█'.repeat(filled) + '░'.repeat(width - filled);
}

function truncate(value, maxLength) {
  if (value.length <= maxLength) {
    return value;
  }

  return `…${value.slice(value.length - maxLength + 1)}`;
}

function escapeMarkdown(value) {
  return String(value).replace(/\|/g, '\\|').replace(/`/g, '\\`');
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

module.exports = {
  escapeHtml,
  escapeMarkdown,
  histBar,
  scoreBar,
  truncate,
};
