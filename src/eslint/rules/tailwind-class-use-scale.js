'use strict';

const { MAX_NOTE_LENGTH, normalizeNote, withNote } = require('../../core/options');
const { createTailwindClassAnalyzer, offScaleClassMessage } = require('../../core/tailwind-class-analysis');
const { classStringValue, createLiteralTokenFixer } = require('../literal-spans');

const RULE_NAME = 'tailwind-class-use-scale';

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
    context.report({
      message: withNote(offScaleClassMessage(segment.token, analysis), analyzer.note),
      node,
      fix: replaceToken && analysis.reason !== 'negative'
        ? replaceToken(segment.start, segment.token, analysis.fixedToken)
        : null,
    });
  }
}

module.exports = {
  meta: {
    docs: {
      url: 'https://github.com/PetriLahdelma/stylelint-plugin-rhythmguard/blob/main/docs/rules/tailwind-class-use-scale.md',
      description: 'Enforce spacing scale for Tailwind arbitrary spacing utilities in class strings',
    },
    fixable: 'code',
    schema: [
      {
        additionalProperties: false,
        properties: {
          allowNegative: { type: 'boolean' },
          baseFontSize: { type: 'number' },
          note: { maxLength: MAX_NOTE_LENGTH, minLength: 1, type: 'string' },
          scale: {
            items: {
              anyOf: [
                { type: 'number' },
                { type: 'string' },
              ],
            },
            type: 'array',
          },
          spacingUnit: {
            anyOf: [
              { exclusiveMinimum: true, minimum: 0, type: 'number' },
              { enum: [false] },
            ],
          },
          units: {
            items: { type: 'string' },
            type: 'array',
          },
        },
        type: 'object',
      },
    ],
  },
  create(context) {
    const option = (context.options && context.options[0]) || {};
    const analyzer = createTailwindClassAnalyzer(option);
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
