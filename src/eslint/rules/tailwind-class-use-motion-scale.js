'use strict';

const { formatTime } = require('../../utils/time');
const { createTailwindMotionAnalyzer } = require('../../utils/tailwind-motion-analysis');

const RULE_NAME = 'tailwind-class-use-motion-scale';

function maybeCheckNodeText(node, sourceCode, context, analyzer, allowFix) {
  const rawText = sourceCode.getText(node);
  let value = null;
  let quote = null;

  if (node.type === 'Literal' && typeof node.value === 'string') {
    value = node.value;
    quote = rawText[0] === '"' || rawText[0] === "'" ? rawText[0] : '"';
  }

  if (node.type === 'TemplateElement') {
    value = node.value.raw;
  }

  if (!value || typeof value !== 'string') {
    return;
  }

  const findings = analyzer.analyzeClassString(value);
  if (findings.length === 0) {
    return;
  }

  let fixedValue = value;
  let fixedValueOffset = 0;

  for (const { analysis, segment } of findings) {
    if (allowFix && analysis.reason === 'duration' && node.type === 'Literal') {
      const replacementStart = segment.start + fixedValueOffset;
      fixedValue = `${fixedValue.slice(0, replacementStart)}${analysis.fixedToken}${fixedValue.slice(replacementStart + segment.token.length)}`;
      fixedValueOffset += analysis.fixedToken.length - segment.token.length;
    }
  }

  const fixedText = allowFix && node.type === 'Literal' && fixedValue !== value
    ? `${quote}${fixedValue.replace(new RegExp(quote, 'g'), `\\${quote}`)}${quote}`
    : null;

  for (const { analysis, segment } of findings) {
    const lower = analysis.nearest
      ? formatTime(analysis.nearest.lower, 'ms')
      : 'n/a';
    const upper = analysis.nearest
      ? formatTime(analysis.nearest.upper, 'ms')
      : 'n/a';
    context.report({
      message: buildMessage(analysis, segment, lower, upper),
      node,
      fix:
        fixedText && analysis.reason === 'duration'
          ? (fixer) => fixer.replaceText(node, fixedText)
          : null,
    });
  }
}

function buildMessage(analysis, segment, lower, upper) {
  if (analysis.reason === 'easing') {
    return `Unexpected Tailwind arbitrary motion easing "${segment.token}". Use motion tokens for easing decisions.`;
  }

  if (analysis.reason === 'negative') {
    return `Unexpected Tailwind arbitrary motion duration "${segment.token}". Use non-negative duration values.`;
  }

  return `Unexpected Tailwind arbitrary motion duration "${segment.token}". Use duration scale values (nearest: ${lower} or ${upper}).`;
}

module.exports = {
  meta: {
    docs: {
      description: 'Enforce duration scale for Tailwind arbitrary motion utilities in class strings',
    },
    fixable: 'code',
    schema: [
      {
        additionalProperties: false,
        properties: {
          durationScale: {
            items: { type: 'number' },
            type: 'array',
          },
          durationUnits: {
            items: {
              enum: ['ms', 's'],
              type: 'string',
            },
            type: 'array',
          },
        },
        type: 'object',
      },
    ],
  },
  create(context) {
    const analyzer = createTailwindMotionAnalyzer(context.options && context.options[0]);
    const sourceCode = context.sourceCode || context.getSourceCode();

    return {
      Literal(node) {
        maybeCheckNodeText(node, sourceCode, context, analyzer, true);
      },
      TemplateElement(node) {
        maybeCheckNodeText(node, sourceCode, context, analyzer, false);
      },
    };
  },
  ruleName: RULE_NAME,
};
