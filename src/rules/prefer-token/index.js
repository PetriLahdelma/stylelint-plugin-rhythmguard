'use strict';

const stylelint = require('stylelint');
const valueParser = require('postcss-value-parser');
const {
  formatLength,
  isHairlineLength,
  numbersEqual,
  parseLengthToken,
  pxOnScale,
  toPx,
} = require('../../core/length');
const {
  buildTokenOptions,
  createPropertyScaleResolver,
} = require('../../core/options');
const {
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
  signedTokensForLength,
  tokenFitsProperty,
  tokenIndexFromDefinitions,
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

/**
 * The token for a raw length, and the text the fix writes. A key with the
 * literal's sign holds exactly that value, so its token is written as is; a
 * negative literal that only matches the positive key gets the token negated.
 * Keys are signed, so a positive literal never finds a negative token (issue
 * #221).
 */
function resolveTokenReplacement(tokenMap, raw, parsedLength, options) {
  const unit = parsedLength.unit || 'px';
  const negative = parsedLength.number < 0;
  // [key, negate]: the literal as written, then normalized, then in px.
  const lookups = [[raw, false], [formatLength(parsedLength.number, unit), false]];
  if (negative) lookups.push([formatLength(Math.abs(parsedLength.number), unit), true]);
  if (options.unitStrategy === 'convert') {
    const px = toPx(parsedLength.number, parsedLength.unit, options.baseFontSize);
    if (px !== null) {
      // Formatted, so 1.1rem at a 14px base is "15.4px", not "15.400000000000002px" (issue #275).
      lookups.push([formatLength(px, 'px'), false]);
      if (negative) lookups.push([formatLength(Math.abs(px), 'px'), true]);
    }
  }

  for (const [key, negate] of lookups) {
    if (Object.prototype.hasOwnProperty.call(tokenMap, key)) {
      const token = tokenMap[key];
      return { replacement: negate ? negateReplacement(token) : token, token };
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
  const px = toPx(parsedLength.number, parsedLength.unit || 'px', options.baseFontSize);
  if (px === null || tokenIndex.length === 0) {
    return { candidates: [] };
  }
  const unit = parsedLength.unit || 'px';
  const sameUnit = signedTokensForLength(tokenIndex, px, unit, { prop });
  const found = sameUnit.tokens.length > 0 || options.unitStrategy !== 'convert'
    ? sameUnit
    : signedTokensForLength(tokenIndex, px, unit, { anyUnit: true, prop });
  const candidates = found.tokens;
  if (candidates.length !== 1) {
    return { candidates };
  }
  const token = `var(${candidates[0]})`;
  const entry = tokenIndex.find((item) => item.token === candidates[0]);
  return {
    candidates,
    fixable: sameUnit.tokens.length === 1,
    origin: entry ? entry.file : null,
    replacement: found.negate ? negateReplacement(token) : token,
    token,
  };
}

/** The custom property a replacement such as `var(--space-2)` or `calc(-1 * var(--space-2))` writes. */
function replacementToken(replacement) {
  const match = typeof replacement === 'string' ? replacement.match(/var\(\s*(--[^\s,)]+)/) : null;
  return match ? match[1] : null;
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

    const tokenRegex = createTokenRegex(options.tokenPattern, { result, root, ruleName });
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

      const source = declarationValueSource(decl);
      const parsed = valueParser(source.parseText);
      const { scaleByUnit, scalePx } = getScaleStateForProperty(prop);
      // Operands of a Sass expression are reported, never rewritten (issue #234).
      const sassOperands = sassOperandNodes(parsed, decl.value);

      // `avoidTokens`: the var() names a fallback literal falls back from. A
      // fallback held by one of them restates that token and passes; it is
      // never replaced with the token it is the fallback of (issue #240).
      const reportNode = (node, parsedLength, position = null, avoidTokens = []) => {
        const fixable = !sassOperands.has(node);
        const mapped = resolveTokenReplacement(tokenMap, node.value, parsedLength, options);
        if (mapped && tokenFitsProperty(mapped.token, prop)) {
          if (avoidTokens.includes(replacementToken(mapped.token))) {
            return;
          }
          const origin = origins[mapped.token] || null;
          reportValueNode({ decl, message: messages.rejected(node.value, mapped.replacement, origin, options.note, [], position), node, replacement: fixable ? mapped.replacement : null, result, ruleName });
          return;
        }
        const indexed = resolveFromIndex(tokenIndex, parsedLength, prop, options);
        if (indexed.candidates.some((candidate) => avoidTokens.includes(candidate))) {
          return;
        }
        const named = indexed.replacement || null;
        reportValueNode({
          decl,
          message: messages.rejected(node.value, named, indexed.origin || null, options.note, indexed.candidates, position),
          node,
          replacement: indexed.fixable && fixable ? named : null,
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
              const onScale = pxOnScale(scalePx, absPx, parsedLength.unit, options.baseFontSize);
              if (onScale) {
                return false;
              }
            }
          }
        }

        reportNode(node, parsedLength, position, (context && context.tokenFallbackOf) || []);
        return true;
      };

      // The bounds of clamp(), min() and max() are checked in translate
      // functions as anywhere else (issue #272).
      const checkedBounds = new Set();
      const visit = (node, context) => {
        if (node.type === 'function') {
          const skipToken = skipTokenFunction(node, options.tokenFunctions, tokenRegex);
          if (skipToken) {
            return skipToken;
          }

          if (options.checkMathBounds && isBoundFunction(node)) {
            for (const bound of collectMathBounds(node)) {
              if (!checkedBounds.has(bound.node)) {
                checkedBounds.add(bound.node);
                checkWordNode(bound.node, context, bound.position);
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

        checkWordNode(node, context);
        return false;
      };

      if (prop === 'transform') {
        walkTransformTranslateNodes(parsed, visit);
      } else {
        walkRootValueNodes(parsed, visit);
      }

      writeDeclarationValue(decl, source, parsed);
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
