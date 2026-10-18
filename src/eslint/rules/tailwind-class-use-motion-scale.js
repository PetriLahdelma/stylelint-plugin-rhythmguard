'use strict';

const { MAX_NOTE_LENGTH, normalizeNote, withNote } = require('../../core/options');
const { nearestText } = require('../../core/length');
const { formatTime } = require('../../core/time');
const { createTailwindMotionAnalyzer } = require('../../core/tailwind-motion-analysis');
const { classStringValue, createLiteralTokenFixer } = require('../literal-spans');

const RULE_NAME = 'tailwind-class-use-motion-scale';

function maybeCheckNodeText(node, sourceCode, context, analyzer, allowFix) {
  const value = classStringValue(node);
  if (!value) {
    return;
  }

  const findings = analyzer.analyzeClassString(value);
  if (findings.length === 0) {
    return;
  }

  // Fixes replace only the raw span of the class token, so escapes and JSX
  // entities elsewhere in the literal are kept as written (#225).
  const replaceToken = allowFix ? createLiteralTokenFixer(node, sourceCode) : null;

  for (const { analysis, segment } of findings) {
    const lower = analysis.nearest
      ? formatTime(analysis.nearest.lower, 'ms')
      : 'n/a';
    const upper = analysis.nearest
      ? formatTime(analysis.nearest.upper, 'ms')
      : 'n/a';
    context.report({
      message: withNote(buildMessage(analysis, segment, lower, upper), analyzer.note),
      node,
      fix: replaceToken && analysis.reason === 'duration'
        ? replaceToken(segment.start, segment.token, analysis.fixedToken)
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

  return `Unexpected Tailwind arbitrary motion duration "${segment.token}". Use duration scale values (${nearestText(lower, upper)}).`;
}

module.exports = {
  meta: {
    type: 'suggestion',
    docs: {
      url: 'https://github.com/PetriLahdelma/stylelint-plugin-rhythmguard/blob/main/docs/rules/tailwind-class-use-motion-scale.md',
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
          note: { maxLength: MAX_NOTE_LENGTH, minLength: 1, type: 'string' },
        },
        type: 'object',
      },
    ],
  },
  create(context) {
    const option = (context.options && context.options[0]) || {};
    const analyzer = createTailwindMotionAnalyzer(option);
    analyzer.note = normalizeNote(option.note);
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
