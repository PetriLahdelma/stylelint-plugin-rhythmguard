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

/** Plain Markdown text, safe in a table cell: pipes and backticks escaped, one line. */
function escapeMarkdown(value) {
  return String(value).replace(/\r?\n/g, ' ').replace(/\|/g, '\\|').replace(/`/g, '\\`');
}

/**
 * A Markdown code span holding `value` verbatim. A backslash does not escape
 * anything inside a code span, so a backtick in the value is kept by a fence
 * one backtick longer than the longest run in it, padded with a space when the
 * value starts or ends with a backtick (CommonMark strips one space from each
 * side). In a table cell a pipe is still escaped, as GFM reads `\|` before it
 * finds code spans (#285).
 */
function markdownCode(value, { table = false } = {}) {
  let text = String(value).replace(/\r?\n/g, ' ');
  if (table) {
    text = text.replace(/\|/g, '\\|');
  }
  const longestRun = Math.max(0, ...(text.match(/`+/g) || []).map((run) => run.length));
  const fence = '`'.repeat(longestRun + 1);
  const pad = /^`|`$/.test(text) || (/^ /.test(text) && / $/.test(text) && text.trim() !== '') ? ' ' : '';
  return `${fence}${pad}${text}${pad}${fence}`;
}

/** markdownCode for a table cell. */
function tableCode(value) {
  return markdownCode(value, { table: true });
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
  markdownCode,
  tableCode,
  scoreBar,
  truncate,
};
