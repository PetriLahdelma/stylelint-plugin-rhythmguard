'use strict';

const stylelint = require('stylelint');
const valueParser = require('postcss-value-parser');
const {
  formatLength,
  isHairlineLength,
  numbersEqual,
  parseLengthToken,
  toPx,
} = require('../../core/length');
const {
  buildTokenOptions,
  createPropertyScaleResolver,
} = require('../../core/options');
const {
  collectMathBounds,
  isBoundFunction,
  isKeyword,
  isMathFunction,
  isTokenFunction,
  propertyMatches,
  shouldLintMathArgument,
  walkRootValueNodes,
  walkTransformTranslateNodes,
} = require('../../core/value-nodes');
const { buildEffectiveTokenMap } = require('../../core/token-map');

const {
  collectTokenDefinitions,
  withResolvedScale,
} = require('../../core/scale-inference');

const { createTokenRegex, reportInvalidPreset, reportValueNode } = require('../report');
const { validatePrimary, validatePreferTokenSecondaryOptions } = require('../validate');

const {
  negateReplacement,
  tokenFitsProperty,
  tokenIndexFromDefinitions,
  tokensForLength,
} = require('../../core/token-index');

const ruleName = 'rhythmguard/prefer-token';

const messages = stylelint.utils.ruleMessages(ruleName, {
  invalidPreset: (presetName, presetNames) =>
    `Unknown scale preset "${presetName}". Available presets: ${presetNames.join(', ')}.`,
  rejected: (value, replacement = null, origin = null, note = '', candidates = [], position = null) =>
    `Unexpected raw ${position || 'scale value'} "${value}". ${replacement
      ? `Use ${replacement}${origin ? ` (${origin})` : ''}.`
      : candidates.length > 1
        ? `Use one of the tokens that hold it: ${listTokens(candidates)}.`
        : 'No known token holds this value; use the nearest token or add one.'}${note ? ` ${note}` : ''}`,
});

function listTokens(tokens) {
  const references = tokens.map((token) => `var(${token})`);
  return references.length > 1
    ? `${references.slice(0, -1).join(', ')} or ${references[references.length - 1]}`
    : references.join('');
}

function applyNegativeToken(replacement, parsedLength) {
  return !replacement || parsedLength.number >= 0 ? replacement : negateReplacement(replacement);
}

/** The token for a raw length, and the text the fix writes (negated when the literal is). */
function resolveTokenReplacement(tokenMap, raw, parsedLength, options) {
  const found = (token) => ({ replacement: applyNegativeToken(token, parsedLength), token });

  if (Object.prototype.hasOwnProperty.call(tokenMap, raw)) {
    return found(tokenMap[raw]);
  }

  const absoluteRaw = formatLength(Math.abs(parsedLength.number), parsedLength.unit || 'px');
  if (Object.prototype.hasOwnProperty.call(tokenMap, absoluteRaw)) {
    return found(tokenMap[absoluteRaw]);
  }

  if (options.unitStrategy === 'convert') {
    const absPx = toPx(Math.abs(parsedLength.number), parsedLength.unit, options.baseFontSize);
    if (absPx !== null) {
      const pxKey = `${absPx}px`;
      if (Object.prototype.hasOwnProperty.call(tokenMap, pxKey)) {
        return found(tokenMap[pxKey]);
      }
    }
  }

  return null;
}

/**
 * The tokens use-scale's `fixWith: "token"` would see: the stylesheet,
 * `scaleSources`, `.rhythmguardrc.json` token sources and installed token
 * packages, filtered to the property's kind. One same-unit token is a fix; a
 * token in another unit, or several tokens, are named but never written.
 */
function resolveFromIndex(tokenIndex, parsedLength, prop, options) {
  const px = toPx(Math.abs(parsedLength.number), parsedLength.unit || 'px', options.baseFontSize);
  if (px === null || tokenIndex.length === 0) {
    return { candidates: [] };
  }
  const unit = parsedLength.unit || 'px';
  const sameUnit = tokensForLength(tokenIndex, px, unit, { prop });
  const candidates = sameUnit.length > 0 || options.unitStrategy !== 'convert'
    ? sameUnit
    : tokensForLength(tokenIndex, px, unit, { anyUnit: true, prop });
  if (candidates.length !== 1) {
    return { candidates };
  }
  const token = `var(${candidates[0]})`;
  const entry = tokenIndex.find((item) => item.token === candidates[0]);
  return {
    candidates,
    fixable: sameUnit.length === 1,
    origin: entry ? entry.file : null,
    replacement: applyNegativeToken(token, parsedLength),
    token,
  };
}

const ruleFunction = (primary, secondaryOptions) => {
  return (root, result) => {
    const valid = validatePrimary(result, ruleName, primary);

    if (!valid) {
      return;
    }

    const validSecondaryOptions = validatePreferTokenSecondaryOptions(
      result,
      ruleName,
      secondaryOptions,
    );
    if (!validSecondaryOptions) {
      return;
    }

    const options = buildTokenOptions(secondaryOptions);
    reportInvalidPreset(options, { message: messages.invalidPreset, result, root, ruleName });

    withResolvedScale(options, root);

    const tokenRegex = createTokenRegex(options.tokenPattern, result, ruleName);
    const origins = {};
    const tokenMap = buildEffectiveTokenMap({
      options,
      origins,
      root,
      tokenRegex,
    });

    const tokenIndex = tokenIndexFromDefinitions(
      collectTokenDefinitions({
        baseFontSize: options.baseFontSize,
        root,
        scaleSources: options.scaleSources,
        tokenPattern: options.tokenPatternExplicit ? options.tokenPattern : null,
        tokenRegex,
      }),
      options.baseFontSize,
    );

    const getScaleStateForProperty = createPropertyScaleResolver(options);

    root.walkDecls((decl) => {
      const prop = decl.prop.toLowerCase();
      if (prop.startsWith('--')) {
        return;
      }

      if (!propertyMatches(prop, options.properties)) {
        return;
      }

      const parsed = valueParser(decl.value);
      const { scaleByUnit, scalePx } = getScaleStateForProperty(prop);
      let changed = false;

      const reportNode = (node, parsedLength, position = null) => {
        const mapped = resolveTokenReplacement(tokenMap, node.value, parsedLength, options);
        if (mapped && tokenFitsProperty(mapped.token, prop)) {
          const origin = origins[mapped.token] || null;
          reportValueNode({ decl, message: messages.rejected(node.value, mapped.replacement, origin, options.note, [], position), node, replacement: mapped.replacement, result, ruleName });
          return;
        }
        const indexed = resolveFromIndex(tokenIndex, parsedLength, prop, options);
        const named = indexed.replacement || null;
        reportValueNode({
          decl,
          message: messages.rejected(node.value, named, indexed.origin || null, options.note, indexed.candidates, position),
          node,
          replacement: indexed.fixable ? named : null,
          result,
          ruleName,
        });
      };

      const checkWordNode = (node, context, position = null) => {
        if (isKeyword(node.value, options.ignoreValues)) {
          return false;
        }

        if (!position && !shouldLintMathArgument(context, options)) {
          return false;
        }

        const parsedLength = parseLengthToken(node.value);
        if (!parsedLength) {
          return false;
        }

        if (parsedLength.number === 0) {
          return false;
        }

        if (parsedLength.unit === '') {
          return false;
        }

        // Percentages are relative to the container or the element itself; they are
        // never spacing-token candidates (translate(-50%, -50%) centering, inset: 100%).
        if (parsedLength.unit === '%') {
          return false;
        }

        if (options.allowHairlines && isHairlineLength(parsedLength, options.baseFontSize)) {
          return false;
        }

        if (
          parsedLength.unit &&
          parsedLength.unit !== '%' &&
          !options.units.includes(parsedLength.unit)
        ) {
          return false;
        }

        if (options.allowNumericScale) {
          if (options.unitStrategy === 'exact') {
            const unit = parsedLength.unit || 'px';
            const unitScale = scaleByUnit.get(unit);
            if (unitScale && unitScale.length > 0) {
              const onScale = unitScale.some((entry) =>
                numbersEqual(entry, Math.abs(parsedLength.number)),
              );
              if (onScale) {
                return false;
              }
            }
          } else {
            const absPx = toPx(Math.abs(parsedLength.number), parsedLength.unit, options.baseFontSize);
            if (absPx !== null) {
              const onScale = scalePx.some((entry) => numbersEqual(entry, absPx));
              if (onScale) {
                return false;
              }
            }
          }
        }

        reportNode(node, parsedLength, position);
        return true;
      };

      if (prop === 'transform') {
        walkTransformTranslateNodes(parsed, (node, context) => {
          if (node.type === 'function') {
            if (isTokenFunction(node, options.tokenFunctions, tokenRegex)) {
              return true;
            }

            if (isMathFunction(node.value) && !options.enforceInsideMathFunctions) {
              return true;
            }

            return false;
          }

          if (node.type !== 'word') {
            return false;
          }

          changed = checkWordNode(node, context) || changed;
          return false;
        });
      } else {
        const checkedBounds = new Set();
        walkRootValueNodes(parsed, (node, context) => {
          if (node.type === 'function') {
            if (isTokenFunction(node, options.tokenFunctions, tokenRegex)) {
              return true;
            }

            if (options.checkMathBounds && isBoundFunction(node)) {
              for (const bound of collectMathBounds(node)) {
                if (!checkedBounds.has(bound.node)) {
                  checkedBounds.add(bound.node);
                  changed = checkWordNode(bound.node, null, bound.position) || changed;
                }
              }
            }

            if (isMathFunction(node.value) && !options.enforceInsideMathFunctions) {
              return true;
            }

            return false;
          }

          if (node.type !== 'word' || checkedBounds.has(node)) {
            return false;
          }

          changed = checkWordNode(node, context) || changed;
          return false;
        });
      }

      if (changed) {
        decl.value = parsed.toString();
      }
    });
  };
};

ruleFunction.ruleName = ruleName;
ruleFunction.messages = messages;
ruleFunction.meta = {
  fixable: true,
  url: 'https://github.com/PetriLahdelma/stylelint-plugin-rhythmguard/blob/main/docs/rules/prefer-token.md',
};

module.exports = stylelint.createPlugin(ruleName, ruleFunction);
module.exports.ruleName = ruleName;
module.exports.messages = messages;
module.exports.meta = ruleFunction.meta;
