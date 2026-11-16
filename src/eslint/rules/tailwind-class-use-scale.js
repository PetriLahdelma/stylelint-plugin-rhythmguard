'use strict';

const { MAX_NOTE_LENGTH, normalizeNote } = require('../../core/options');
const { formatLength } = require('../../core/length');
const { CLASS_MESSAGES, createTailwindClassAnalyzer, offScaleClassReport } = require('../../core/tailwind-class-analysis');
const { classStringValue, createTokenSpans, isClassAttributeText } = require('../literal-spans');
const { createClassContextMatchers, isClassString } = require('../class-context');

const RULE_NAME = 'tailwind-class-use-scale';

/**
 * The report location of one class token: its own raw span inside the
 * literal (cs-09), or null for the whole node when the span cannot be
 * aligned or the host has no `getLocFromIndex`.
 */
function tokenLoc(spans, sourceCode, segment) {
  if (!spans || typeof sourceCode.getLocFromIndex !== 'function') {
    return null;
  }
  // The span lies inside the node's own range, so both offsets are valid.
  const range = spans.locate(segment.start, segment.token);
  return range
    ? { end: sourceCode.getLocFromIndex(range[1]), start: sourceCode.getLocFromIndex(range[0]) }
    : null;
}

/**
 * Editor suggestions for the two nearest steps, each a fix of the token
 * alone. The nearest step comes first, so a host that applies the first
 * suggestion (`oxlint --fix-suggestions`) writes what `fixOffScale:
 * "nearest"` would.
 */
function stepSuggestions(spans, segment, analysis) {
  if (!spans || analysis.reason !== 'off-scale' || !analysis.nearest) {
    return [];
  }
  const lower = [analysis.lowerToken, analysis.nearest.lower];
  const upper = [analysis.upperToken, analysis.nearest.upper];
  const steps = analysis.nearest.nearest === analysis.nearest.lower ? [lower, upper] : [upper, lower];
  const suggestions = [];
  for (const [replacement, stepPx] of steps) {
    if (!replacement || suggestions.some((suggestion) => suggestion.data.replacement === replacement)) {
      continue;
    }
    const fix = spans.replace(segment.start, segment.token, replacement);
    if (fix) {
      suggestions.push({ data: { px: formatLength(stepPx, 'px'), replacement }, fix, messageId: 'useStep' });
    }
  }
  return suggestions;
}

function maybeCheckNodeText(node, sourceCode, context, analyzer, matchers) {
  const value = classStringValue(node);
  if (!value) {
    return;
  }

  const findings = analyzer.analyzeClassString(value);
  if (findings.length === 0) {
    return;
  }

  // Only class strings are checked: class contexts, or elsewhere a string
  // holding two or more utility-shaped tokens; never a type position or a
  // non-class attribute (cs-04, fix-09). Markup class text is gated by the
  // caller. Run after the cheap analysis, so most strings never walk up.
  if (matchers && !isClassString(node, value, matchers)) {
    return;
  }

  // Locations, fixes and suggestions use only the raw span of the class
  // token, so escapes and JSX or HTML entities elsewhere in the literal are
  // kept as written (#225).
  const spans = createTokenSpans(node, sourceCode);
  const suffix = analyzer.note ? ` ${analyzer.note}` : '';

  for (const { analysis, segment } of findings) {
    const { data, messageId } = offScaleClassReport(segment.token, analysis, analyzer.options.scaleName, suffix);
    // Autofix only rewrites a class to one that renders the same value. An
    // off-scale value moves layout whichever step it takes, so it gets the
    // two nearest steps as suggestions; `fixOffScale: "nearest"` also writes
    // the nearest step, as 3.20 did (cs-06, fix-10).
    const autofix = analysis.reason === 'equivalent'
      || (analysis.reason === 'off-scale' && analyzer.fixOffScale === 'nearest');
    const fix = spans && autofix && analysis.fixedToken
      ? spans.replace(segment.start, segment.token, analysis.fixedToken)
      : null;
    const loc = tokenLoc(spans, sourceCode, segment);
    const suggest = stepSuggestions(spans, segment, analysis);

    context.report({
      data,
      fix,
      ...(loc ? { loc } : {}),
      messageId,
      node,
      ...(suggest.length > 0 ? { suggest } : {}),
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
    hasSuggestions: true,
    messages: {
      ...CLASS_MESSAGES,
      useStep: 'Use "{{replacement}}" ({{px}}).',
    },
    schema: [
      {
        additionalProperties: false,
        properties: {
          allowHairlines: { type: 'boolean' },
          allowNegative: { type: 'boolean' },
          baseFontSize: { type: 'number' },
          classContexts: {
            items: { minLength: 1, type: 'string' },
            type: 'array',
          },
          classFunctions: {
            items: { minLength: 1, type: 'string' },
            type: 'array',
          },
          fixOffScale: { enum: ['nearest', false] },
          note: { maxLength: MAX_NOTE_LENGTH, minLength: 1, type: 'string' },
          reportEquivalents: { type: 'boolean' },
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
    analyzer.fixOffScale = option.fixOffScale === 'nearest' ? 'nearest' : false;
    const sourceCode = context.sourceCode || context.getSourceCode();
    const matchers = createClassContextMatchers(option);

    // String literals and template literal chunks; a chunk is fixed only when
    // its text has no escape (fix-10).
    const Literal = (node) => maybeCheckNodeText(node, sourceCode, context, analyzer, matchers);
    const TemplateElement = Literal;
    // Static class text in Vue and Svelte markup, already known to be a class
    // attribute value.
    const ClassText = (node) => maybeCheckNodeText(node, sourceCode, context, analyzer, null);
    const scriptVisitor = { Literal, TemplateElement };
    const parserServices = sourceCode.parserServices || context.parserServices;

    // svelte-eslint-parser: the static text of a `class` attribute value is a
    // `SvelteLiteral` (#244). The listener is only added when the parser
    // declares the node type, so hosts that reject unknown node types (such
    // as other linters' JS plugin runtimes) never see it.
    if ((sourceCode.visitorKeys && sourceCode.visitorKeys.SvelteLiteral) || (parserServices && parserServices.isSvelte)) {
      scriptVisitor.SvelteLiteral = (node) => {
        if (isClassAttributeText(node, matchers.isClassContextName)) {
          ClassText(node);
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
            if (isClassAttributeText(node, matchers.isClassContextName)) {
              ClassText(node);
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
