'use strict';

const { MAX_NOTE_LENGTH, normalizeNote, withNote } = require('../../core/options');
const { createTailwindClassAnalyzer, offScaleClassMessage } = require('../../core/tailwind-class-analysis');
const { classStringValue, createTokenFixer, isClassAttributeText } = require('../literal-spans');

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
  // or HTML entities elsewhere in the literal are kept as written (#225).
  const replaceToken = allowFix ? createTokenFixer(node, sourceCode) : null;

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
    type: 'suggestion',
    docs: {
      url: 'https://github.com/PetriLahdelma/stylelint-plugin-rhythmguard/blob/main/docs/rules/tailwind-class-use-scale.md',
      description: 'Enforce spacing scale for Tailwind arbitrary spacing utilities in class strings',
    },
    fixable: 'code',
    schema: [
      {
        additionalProperties: false,
        properties: {
          allowHairlines: { type: 'boolean' },
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

    const Literal = (node) => maybeCheckNodeText(node, sourceCode, context, analyzer, true);
    const TemplateElement = (node) => maybeCheckNodeText(node, sourceCode, context, analyzer, false);
    const scriptVisitor = { Literal, TemplateElement };
    const parserServices = sourceCode.parserServices || context.parserServices;

    // svelte-eslint-parser: the static text of a `class` attribute value is a
    // `SvelteLiteral` (#244). The listener is only added when the parser
    // declares the node type, so hosts that reject unknown node types (such
    // as other linters' JS plugin runtimes) never see it.
    if ((sourceCode.visitorKeys && sourceCode.visitorKeys.SvelteLiteral) || (parserServices && parserServices.isSvelte)) {
      scriptVisitor.SvelteLiteral = (node) => {
        if (isClassAttributeText(node)) {
          Literal(node);
        }
      };
    }

    // vue-eslint-parser keeps `<template>` in a separate tree that only
    // `defineTemplateBodyVisitor` walks (#244). No runtime dependency: the
    // service is used when the parser provides it.
    if (parserServices && typeof parserServices.defineTemplateBodyVisitor === 'function') {
      return parserServices.defineTemplateBodyVisitor(
        {
          Literal,
          TemplateElement,
          VLiteral(node) {
            if (isClassAttributeText(node)) {
              Literal(node);
            }
          },
        },
        scriptVisitor,
      );
    }

    return scriptVisitor;
  },
  ruleName: RULE_NAME,
};
