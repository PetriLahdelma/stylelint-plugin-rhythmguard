'use strict';

const stylelint = require('stylelint');
const valueParser = require('postcss-value-parser');
const {
  formatLength,
  isHairlineLength,
  nearestScaleValues,
  nearestText,
  numbersEqual,
  parseLengthToken,
  pxOnScale,
  toPx,
} = require('../../core/length');
const {
  buildScaleOptions,
  createPropertyScaleResolver,
} = require('../../core/options');
const {
  blankBlockComments,
  collectMathBounds,
  declarationValueSource,
  isBoundFunction,
  isKeyword,
  isMathFunction,
  propertyMatches,
  sassOperandNodes,
  shouldLintMathArgument,
  skipTokenFunction,
  walkRootValueNodes,
  walkTransformTranslateNodes,
  writeDeclarationValue,
  writeValueEdits,
} = require('../../core/value-nodes');

const {
  autoScaleFallbackNote,
  collectTokenDefinitions,
  withResolvedScale,
} = require('../../core/scale-inference');
const { createScssVariableResolver, evaluateScssValueList } = require('../../core/token-sources');

const { createTokenRegex, reportInvalidPreset, reportProblem, reportValueNode } = require('../report');
const { decisionFor, loadRcDecisions } = require('../../core/decisions');
const { replacementFor, tokenHoldsNote, tokenIndexFromDefinitions } = require('../../core/token-index');
const { validatePrimary, validateUseScaleSecondaryOptions } = require('../validate');

const ruleName = 'rhythmguard/use-scale';

const messages = stylelint.utils.ruleMessages(ruleName, {
  invalidPreset: (presetName, presetNames) =>
    `Unknown scale preset "${presetName}". Available presets: ${presetNames.join(', ')}.`,
  rejected: (value, lower, upper, note = '', position = null, aside = '', group = null) =>
    `Unexpected off-scale ${position ? `${position} "${value}"${aside}` : `value "${value}"`}. Use ${group ? `${group} ` : ''}scale values (${nearestText(lower, upper)}).${note ? ` ${note}` : ''}`,
});

/** " (16.8px)" after a bound written in rem or em, so the reader sees what was compared. */
function pxAside(value, baseFontSize) {
  const parsed = parseLengthToken(value);
  if (!parsed || !parsed.unit || parsed.unit === 'px' || parsed.unit === '%') {
    return '';
  }
  const px = toPx(Math.abs(parsed.number), parsed.unit, baseFontSize);
  return px === null ? '' : ` (${formatLength(parsed.number < 0 ? -px : px, 'px')})`;
}

/** Decisions from .rhythmguardrc.json; an invalid section is reported once and ignored. */
function readDecisions(options, { result, root }) {
  if (!options.readDecisions) {
    return [];
  }
  try {
    return loadRcDecisions(process.cwd(), { baseFontSize: options.baseFontSize });
  } catch (error) {
    reportProblem(error.message, { result, root, ruleName });
    return [];
  }
}

function checkLengthValue({
  avoidTokens = [],
  decl,
  evaluated = null,
  fixable = true,
  node,
  options,
  report,
  scaleByUnit,
  scalePx,
}) {
  // `evaluated` is a length that came from a Sass expression; the node's text is
  // the expression, which is reported but never rewritten.
  const parsedLength = evaluated || parseLengthToken(node.value);

  if (!parsedLength) {
    return false;
  }

  if (parsedLength.number === 0) {
    return false;
  }

  if (parsedLength.unit === '') {
    return false;
  }

  if (parsedLength.unit === '%') {
    if (options.allowPercentages) {
      return false;
    }

    report(node.value, decl, node, null, null, '%');
    return false;
  }

  if (options.allowHairlines && isHairlineLength(parsedLength, options.baseFontSize)) {
    return false;
  }

  if (!options.allowNegative && parsedLength.number < 0) {
    report(node.value, decl, node, null, null, parsedLength.unit || 'px');
    return false;
  }

  if (
    parsedLength.unit &&
    parsedLength.unit !== '%' &&
    !options.units.includes(parsedLength.unit)
  ) {
    return false;
  }

  const decidedPx = toPx(Math.abs(parsedLength.number), parsedLength.unit, options.baseFontSize);
  const decision = decidedPx === null ? null : decisionFor(decidedPx, decl.prop, options.decisions);
  if (decision && (decision.decision === 'adopt' || decision.decision === 'allow')) {
    return false;
  }

  if (options.unitStrategy === 'exact') {
    const unit = parsedLength.unit || 'px';
    const unitScale = scaleByUnit.get(unit);

    if (!unitScale || unitScale.length === 0) {
      return false;
    }

    const absoluteValue = Math.abs(parsedLength.number);
    const isOnScale = unitScale.some((entry) => numbersEqual(entry, absoluteValue));
    if (isOnScale) {
      return false;
    }

    const nearest = nearestScaleValues(absoluteValue, unitScale);
    if (!nearest) {
      return false;
    }

    const fixedValue = options.fixToScale && fixable
      ? replacementFor(parsedLength, nearest.nearest, options, decl.prop, avoidTokens)
      : null;

    report(node.value, decl, node, nearest, fixedValue, unit, evaluated ? evaluatedNote(evaluated, options) : '');
    return true;
  }

  const pxValue = toPx(Math.abs(parsedLength.number), parsedLength.unit, options.baseFontSize);

  if (pxValue === null) {
    return false;
  }

  const isOnScale = pxOnScale(scalePx, pxValue, parsedLength.unit, options.baseFontSize);
  if (isOnScale) {
    return false;
  }

  const nearest = nearestScaleValues(pxValue, scalePx);
  if (!nearest) {
    return false;
  }

  const fixedValue = options.fixToScale && fixable
    ? replacementFor(parsedLength, nearest.nearest, options, decl.prop, avoidTokens)
    : null;

  report(node.value, decl, node, nearest, fixedValue, 'px', evaluated ? evaluatedNote(evaluated, options) : '');
  return true;
}

/** What a Sass expression came to, so the reader sees the number the scale was checked against. */
function evaluatedNote(evaluated, options) {
  const px = toPx(evaluated.number, evaluated.unit, options.baseFontSize);
  return px === null ? '' : `Evaluates to ${formatLength(px, 'px')}.`;
}

/**
 * Sass values (`$spacer * .3`, `math.div($spacer, 2)`, `$y $x`) are evaluated
 * with the file's own variables first and the project's spacing tokens second,
 * and each term is checked like a literal. Terms that do not resolve are left
 * alone, as they always were.
 */
function checkSassValue({ decl, options, report, resolveVariable, scaleByUnit, scalePx }) {
  // Offsets are offsets into the value as written, comments included (issue #233).
  const source = declarationValueSource(decl);
  const terms = evaluateScssValueList(blankBlockComments(source.parseText), resolveVariable, new Set());
  if (!terms) {
    // Not fully evaluable (an unknown variable, interpolation, a keyword): the
    // literal walk below still checks the plain lengths in the value.
    return false;
  }
  // Fixes are collected as spans of the written value and written once at the
  // end. Stylelint orders the warnings by position.
  const edits = [];
  for (const term of [...terms].reverse()) {
    if (!term.unit || term.number === 0) {
      continue;
    }
    const node = {
      sourceIndex: term.start,
      type: 'word',
      get value() { return source.text.slice(term.start, term.end); },
      // The fix writes into the declaration at the term's span.
      set value(replacement) { edits.push({ end: term.end, start: term.start, text: replacement }); },
    };
    checkLengthValue({
      decl,
      evaluated: { number: term.number, unit: term.unit },
      // A term that is a plain literal keeps its autofix; an expression is only reported.
      fixable: parseLengthToken(term.text) !== null,
      node,
      options,
      report,
      scaleByUnit,
      scalePx,
    });
  }
  writeValueEdits(decl, source, edits);
  return true;
}

const ruleFunction = (primary, secondaryOptions) => {
  return (root, result) => {
    const valid = validatePrimary(result, ruleName, primary);

    if (!valid) {
      return;
    }

    const validSecondaryOptions = validateUseScaleSecondaryOptions(
      result,
      ruleName,
      secondaryOptions,
    );
    if (!validSecondaryOptions) {
      return;
    }

    const options = buildScaleOptions(secondaryOptions);
    reportInvalidPreset(options, { message: messages.invalidPreset, result, root, ruleName });
    options.decisions = readDecisions(options, { result, root });
    withResolvedScale(options, root);

    const tokenRegex = createTokenRegex(options.tokenPattern, { result, root, ruleName });
    if (options.fixWith === 'token') {
      options.tokenIndex = tokenIndexFromDefinitions(
        collectTokenDefinitions({
          baseFontSize: options.baseFontSize,
          root,
          scaleSources: options.scaleSources,
          tokenPattern: options.tokenPatternExplicit ? options.tokenPattern : null,
          tokenRegex,
        }),
        options.baseFontSize,
      );
    }

    let fallbackNote = autoScaleFallbackNote(options.scaleInference);
    const getScaleStateForProperty = createPropertyScaleResolver(options);

    const report = (value, decl, node, nearest, fixedValue = null, nearestUnit = 'px', extraNote = '', position = null) => {
      const lower = nearest ? formatLength(nearest.lower, nearestUnit) : 'n/a';
      const upper = nearest ? formatLength(nearest.upper, nearestUnit) : 'n/a';
      const tokenNote = nearest ? tokenHoldsNote(fixedValue, formatLength(nearest.nearest, nearestUnit), String(value).trim().startsWith('-')) : '';
      reportValueNode({
        decl,
        message: messages.rejected(value, lower, upper, [fallbackNote, tokenNote, extraNote, options.note].filter(Boolean).join(' '), position, position ? pxAside(value, options.baseFontSize) : '', getScaleStateForProperty(decl.prop.toLowerCase()).group),
        node,
        replacement: fixedValue,
        result,
        ruleName,
      });
      fallbackNote = '';
    };

    // Built on the first Sass value seen, so plain CSS pays nothing.
    let resolveSassVariable = null;
    const sassResolver = () => {
      if (!resolveSassVariable) {
        const definitions = collectTokenDefinitions({ baseFontSize: options.baseFontSize, root, scaleSources: options.scaleSources, tokenRegex });
        resolveSassVariable = createScssVariableResolver(root.source && root.source.input ? root.source.input.css : '', (name) => {
          const definition = definitions.get(`$${name}`);
          const first = definition ? [...definition.values][0] : null;
          const parsed = first ? parseLengthToken(String(first).trim()) : null;
          return parsed && parsed.unit ? { number: parsed.number, unit: parsed.unit } : null;
        });
      }
      return resolveSassVariable;
    };

    root.walkDecls((decl) => {
      const prop = decl.prop.toLowerCase();
      if (prop.startsWith('--') || prop.startsWith('$')) {
        return;
      }

      if (!propertyMatches(prop, options.properties)) {
        return;
      }

      const { scaleByUnit, scalePx } = getScaleStateForProperty(prop);

      if (decl.value.includes('$') && checkSassValue({ decl, options, report, resolveVariable: sassResolver(), scaleByUnit, scalePx })) {
        return;
      }

      const source = declarationValueSource(decl);
      const parsed = valueParser(source.parseText);
      // Operands of a Sass expression that did not resolve are reported, never rewritten (issue #234).
      const sassOperands = sassOperandNodes(parsed, decl.value);

      if (prop === 'transform') {
        walkTransformTranslateNodes(parsed, (node, context) => {

          if (node.type === 'function') {
            const skipToken = skipTokenFunction(node, options.tokenFunctions, tokenRegex);
            if (skipToken) {
              return skipToken;
            }

            if (isMathFunction(node.value) && !options.enforceInsideMathFunctions) {
              return true;
            }

            return false;
          }

          if (node.type !== 'word') {
            return false;
          }

          if (isKeyword(node.value, options.ignoreValues)) {
            return false;
          }

          if (!shouldLintMathArgument(context, options)) {
            return false;
          }

          checkLengthValue({
            avoidTokens: context.tokenFallbackOf,
            decl,
            fixable: !sassOperands.has(node),
            node,
            options,
            report,
            scaleByUnit,
            scalePx,
          });

          return false;
        });
      } else {
        const checkedBounds = new Set();
        walkRootValueNodes(parsed, (node, context) => {

          if (node.type === 'function') {
            const skipToken = skipTokenFunction(node, options.tokenFunctions, tokenRegex);
            if (skipToken) {
              return skipToken;
            }

            if (options.checkMathBounds && isBoundFunction(node)) {
              for (const bound of collectMathBounds(node)) {
                if (checkedBounds.has(bound.node)) {
                  continue;
                }
                checkedBounds.add(bound.node);
                if (isKeyword(bound.node.value, options.ignoreValues)) {
                  continue;
                }
                const boundReport = (value, d, n, nearest, fixed, unit, extra) => report(value, d, n, nearest, fixed, unit, extra, bound.position);
                checkLengthValue({ avoidTokens: context.tokenFallbackOf, decl, fixable: !sassOperands.has(bound.node), node: bound.node, options, report: boundReport, scaleByUnit, scalePx });
              }
            }

            if (
              isMathFunction(node.value) &&
              !options.enforceInsideMathFunctions
            ) {
              return true;
            }

            return false;
          }

          if (node.type !== 'word' || checkedBounds.has(node)) {
            return false;
          }

          if (isKeyword(node.value, options.ignoreValues)) {
            return false;
          }

          if (!shouldLintMathArgument(context, options)) {
            return false;
          }

          checkLengthValue({
            avoidTokens: context.tokenFallbackOf,
            decl,
            fixable: !sassOperands.has(node),
            node,
            options,
            report,
            scaleByUnit,
            scalePx,
          });

          return false;
        });
      }

      writeDeclarationValue(decl, source, parsed);
    });
  };
};

ruleFunction.ruleName = ruleName;
ruleFunction.messages = messages;
ruleFunction.meta = {
  fixable: true,
  url: 'https://github.com/PetriLahdelma/stylelint-plugin-rhythmguard/blob/main/docs/rules/use-scale.md',
};

module.exports = stylelint.createPlugin(ruleName, ruleFunction);
module.exports.ruleName = ruleName;
module.exports.messages = messages;
module.exports.meta = ruleFunction.meta;
