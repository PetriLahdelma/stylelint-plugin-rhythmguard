'use strict';

const { formatLength } = require('../../utils/length');
const { createTailwindClassAnalyzer } = require('../../utils/tailwind-class-analysis');

const RULE_NAME = 'tailwind-class-use-scale';

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
    if (allowFix && analysis.reason !== 'negative' && node.type === 'Literal') {
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
      ? formatLength(analysis.nearest.lower, 'px')
      : 'n/a';
    const upper = analysis.nearest
      ? formatLength(analysis.nearest.upper, 'px')
      : 'n/a';
    context.report({
      message:
        analysis.reason === 'negative'
          ? `Unexpected Tailwind arbitrary spacing value "${segment.token}". Negative values are disabled for this rule.`
          : `Unexpected Tailwind arbitrary spacing value "${segment.token}". Use scale values (nearest: ${lower} or ${upper}).`,
      node,
      fix:
        fixedText && analysis.reason !== 'negative'
          ? (fixer) => fixer.replaceText(node, fixedText)
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
          scale: {
            items: {
              anyOf: [
                { type: 'number' },
                { type: 'string' },
              ],
            },
            type: 'array',
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
    const analyzer = createTailwindClassAnalyzer(context.options && context.options[0]);
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
