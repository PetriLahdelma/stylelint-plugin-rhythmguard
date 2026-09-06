'use strict';

/**
 * Findings from template files: Tailwind class strings inside string literals,
 * for spacing and (opt-in) motion, with line and column recovered from offsets.
 */
const fs = require('node:fs');
const { formatLength } = require('../../core/length');
const { createTailwindClassAnalyzer } = require('../../core/tailwind-class-analysis');
const { createTailwindMotionAnalyzer } = require('../../core/tailwind-motion-analysis');
const { formatTime } = require('../../core/time');
const {
  formatPath,
} = require('../shared');

function collectTailwindFindings(templateFiles, options) {
  const analyzer = createTailwindClassAnalyzer(options);
  const findings = [];

  for (const filePath of templateFiles) {
    let source = '';
    try {
      source = fs.readFileSync(filePath, 'utf8');
    } catch {
      continue;
    }

    const lineStarts = getLineStarts(source);

    for (const literal of findStringLiterals(source)) {
      for (const { analysis, segment } of analyzer.analyzeClassString(literal.value)) {
        const position = offsetToLineColumn(lineStarts, literal.valueStart + segment.start);
        findings.push({
          column: position.column,
          file: formatPath(filePath),
          fixedToken: analysis.fixedToken,
          line: position.line,
          nearest: analysis.nearest
            ? {
              lower: formatLength(analysis.nearest.lower, 'px'),
              upper: formatLength(analysis.nearest.upper, 'px'),
            }
            : null,
          rawValue: analysis.rawValue,
          rule: 'rhythmguard-tailwind/tailwind-class-use-scale',
          text: analysis.reason === 'negative'
            ? `Unexpected Tailwind arbitrary spacing value "${segment.token}". Negative values are disabled for this rule.`
            : `Unexpected Tailwind arbitrary spacing value "${segment.token}". Use scale values.`,
          token: segment.token,
          type: 'tailwind-arbitrary-spacing',
          utility: analysis.utility,
        });
      }
    }
  }

  return findings;
}

function collectTailwindMotionFindings(templateFiles, options) {
  if (!options.includeMotion) {
    return [];
  }

  const analyzer = createTailwindMotionAnalyzer(options);
  const findings = [];

  for (const filePath of templateFiles) {
    let source = '';
    try {
      source = fs.readFileSync(filePath, 'utf8');
    } catch {
      continue;
    }

    const lineStarts = getLineStarts(source);

    for (const literal of findStringLiterals(source)) {
      for (const { analysis, segment } of analyzer.analyzeClassString(literal.value)) {
        const position = offsetToLineColumn(lineStarts, literal.valueStart + segment.start);
        findings.push({
          column: position.column,
          file: formatPath(filePath),
          fixedToken: analysis.fixedToken,
          line: position.line,
          nearest: analysis.nearest
            ? {
              lower: formatTime(analysis.nearest.lower, 'ms'),
              upper: formatTime(analysis.nearest.upper, 'ms'),
            }
            : null,
          rawValue: analysis.rawValue,
          rule: 'rhythmguard-tailwind/tailwind-class-use-motion-scale',
          text: buildTailwindMotionFindingText(segment.token, analysis),
          token: segment.token,
          type: analysis.reason === 'easing'
            ? 'tailwind-motion-easing'
            : 'tailwind-motion-duration',
          utility: analysis.utility,
        });
      }
    }
  }

  return findings;
}

function buildTailwindMotionFindingText(token, analysis) {
  if (analysis.reason === 'easing') {
    return `Unexpected Tailwind arbitrary motion easing "${token}". Use motion tokens for easing decisions.`;
  }

  if (analysis.reason === 'negative') {
    return `Unexpected Tailwind arbitrary motion duration "${token}". Use non-negative duration values.`;
  }

  return `Unexpected Tailwind arbitrary motion duration "${token}". Use duration scale values.`;
}

function findStringLiterals(source) {
  const literals = [];
  const literalPattern = /(["'`])((?:\\[\s\S]|(?!\1)[\s\S])*?)\1/g;
  let match;

  while ((match = literalPattern.exec(source)) !== null) {
    literals.push({
      quote: match[1],
      value: match[2],
      valueStart: match.index + 1,
    });
  }

  return literals;
}

function getLineStarts(source) {
  const starts = [0];

  for (let index = 0; index < source.length; index++) {
    if (source[index] === '\n') {
      starts.push(index + 1);
    }
  }

  return starts;
}

function offsetToLineColumn(lineStarts, offset) {
  let low = 0;
  let high = lineStarts.length - 1;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    if (lineStarts[mid] <= offset) {
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  const lineIndex = Math.max(0, high);
  return {
    column: offset - lineStarts[lineIndex] + 1,
    line: lineIndex + 1,
  };
}

module.exports = {
  buildTailwindMotionFindingText,
  collectTailwindFindings,
  collectTailwindMotionFindings,
  findStringLiterals,
  getLineStarts,
  offsetToLineColumn,
};
