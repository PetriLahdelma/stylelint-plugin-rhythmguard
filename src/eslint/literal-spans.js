'use strict';

/**
 * Maps the decoded value of a string literal back to its raw source text, so
 * an autofix can replace one class token in place and leave every escape
 * sequence (`\n`, `\\`, `\'`, `\u00e9`, a line continuation) and every JSX
 * entity (`&quot;`, `&#65;`) around it byte for byte (#225).
 *
 * Each UTF-16 unit of the decoded value gets the raw span that produced it.
 * A token is only replaceable when its raw span is exactly the token text, so
 * a class written with an escape inside it (`p-[13\x70x]`) is never fixed.
 */

const SINGLE_CHARACTER_ESCAPES = {
  b: '\b',
  f: '\f',
  n: '\n',
  r: '\r',
  t: '\t',
  v: '\v',
};

const HEX_2 = /^[0-9a-fA-F]{2}$/;
const HEX_4 = /^[0-9a-fA-F]{4}$/;
const HEX_ANY = /^[0-9a-fA-F]+$/;
const OCTAL_DIGIT = /^[0-7]$/;
const JSX_ENTITY = /^&(?:#[xX]([0-9a-fA-F]+)|#([0-9]+)|[A-Za-z][A-Za-z0-9]*);/;
const LINE_TERMINATOR = /[\n\r\u2028\u2029]/;

function decodeJsStringBody(body) {
  const pieces = [];
  let index = 0;

  while (index < body.length) {
    const char = body[index];
    if (char !== '\\') {
      pieces.push({ end: index + 1, start: index, text: char });
      index += 1;
      continue;
    }

    const next = body[index + 1];
    if (next === undefined) {
      return null;
    }

    let end = index + 2;
    let text;

    if (next === '\r') {
      end = body[index + 2] === '\n' ? index + 3 : index + 2;
      text = '';
    } else if (next === '\n' || next === '\u2028' || next === '\u2029') {
      text = '';
    } else if (next === 'x') {
      const hex = body.slice(index + 2, index + 4);
      if (!HEX_2.test(hex)) {
        return null;
      }
      end = index + 4;
      text = String.fromCharCode(Number.parseInt(hex, 16));
    } else if (next === 'u' && body[index + 2] === '{') {
      const close = body.indexOf('}', index + 3);
      const hex = close === -1 ? '' : body.slice(index + 3, close);
      const codePoint = HEX_ANY.test(hex) ? Number.parseInt(hex, 16) : Number.NaN;
      if (!(codePoint <= 0x10ffff)) {
        return null;
      }
      end = close + 1;
      text = String.fromCodePoint(codePoint);
    } else if (next === 'u') {
      const hex = body.slice(index + 2, index + 6);
      if (!HEX_4.test(hex)) {
        return null;
      }
      end = index + 6;
      text = String.fromCharCode(Number.parseInt(hex, 16));
    } else if (OCTAL_DIGIT.test(next)) {
      // Legacy octal escape (sloppy mode): up to three digits, at most \377.
      let digits = next;
      if (OCTAL_DIGIT.test(body[end] || '')) {
        digits += body[end];
        end += 1;
        if (next <= '3' && OCTAL_DIGIT.test(body[end] || '')) {
          digits += body[end];
          end += 1;
        }
      }
      text = String.fromCharCode(Number.parseInt(digits, 8));
    } else {
      text = SINGLE_CHARACTER_ESCAPES[next] ?? next;
    }

    pieces.push({ end, start: index, text });
    index = end;
  }

  return pieces;
}

function alignJsxAttributeBody(body, value) {
  const pieces = [];
  let rawIndex = 0;
  let valueIndex = 0;

  while (rawIndex < body.length) {
    const entity = body[rawIndex] === '&'
      ? JSX_ENTITY.exec(body.slice(rawIndex, rawIndex + 12))
      : null;

    if (!entity) {
      if (body[rawIndex] !== value[valueIndex]) {
        return null;
      }
      pieces.push({ end: rawIndex + 1, start: rawIndex, text: body[rawIndex] });
      rawIndex += 1;
      valueIndex += 1;
      continue;
    }

    const entityText = entity[0];
    let text;
    if (value.startsWith(entityText, valueIndex)) {
      // Unknown names are kept as written by the JSX parser.
      text = entityText;
    } else if (entity[1] || entity[2]) {
      const codePoint = Number.parseInt(entity[1] || entity[2], entity[1] ? 16 : 10);
      const candidates = codePoint <= 0x10ffff
        ? [String.fromCodePoint(codePoint), String.fromCharCode(codePoint)]
        : [String.fromCharCode(codePoint)];
      text = candidates.find((candidate) => value.startsWith(candidate, valueIndex));
    } else {
      // Every named XHTML entity decodes to one UTF-16 unit.
      text = value[valueIndex];
    }

    if (text === undefined || valueIndex + text.length > value.length) {
      return null;
    }

    pieces.push({ end: rawIndex + entityText.length, start: rawIndex, text });
    rawIndex += entityText.length;
    valueIndex += text.length;
  }

  return valueIndex === value.length ? pieces : null;
}

function isJsxAttributeValue(node) {
  return Boolean(node.parent && node.parent.type === 'JSXAttribute' && node.parent.value === node);
}

/**
 * Returns `replace(start, token, replacement)` for a string Literal node,
 * which gives an ESLint fix replacing only that token's raw span, or null
 * when the token cannot be located safely. Returns null for any other node.
 */
function createLiteralTokenFixer(node, sourceCode) {
  const spans = literalTokenSpans(node, sourceCode);
  return spans ? spans.replace : null;
}

function literalTokenSpans(node, sourceCode) {
  if (node.type !== 'Literal' || typeof node.value !== 'string' || !Array.isArray(node.range)) {
    return null;
  }

  const rawText = sourceCode.getText(node);
  const quote = rawText[0];
  if ((quote !== '"' && quote !== "'") || rawText.length < 2 || rawText[rawText.length - 1] !== quote) {
    return null;
  }

  const body = rawText.slice(1, -1);
  const jsx = isJsxAttributeValue(node);
  const pieces = jsx ? alignJsxAttributeBody(body, node.value) : decodeJsStringBody(body);
  if (!pieces || pieces.map((piece) => piece.text).join('') !== node.value) {
    return null;
  }

  const isUnsafe = (replacement) => replacement.includes(quote)
    || replacement.includes('\\')
    || LINE_TERMINATOR.test(replacement)
    || (jsx && replacement.includes('&'));

  return tokenSpans(body, node.range[0] + 1, pieces, isUnsafe);
}

// Characters a replacement may not contain inside a markup attribute value,
// quoted or not: quotes, entity and tag syntax, Svelte mustaches, whitespace.
const UNSAFE_IN_MARKUP = /["'`&<>{}=\\\s]/;

/**
 * Returns `replace(start, token, replacement)` for the static text of a Vue
 * (`VLiteral`, vue-eslint-parser) or Svelte (`SvelteLiteral`,
 * svelte-eslint-parser) attribute value, or null when the source text cannot
 * be aligned with the node's value. The node's range may or may not include
 * the quotes; both are tried. Entities are kept as written, and a text that
 * does not align exactly with the value gets no fix rather than a guess (#244).
 */
function createMarkupTextFixer(node, sourceCode) {
  const spans = markupTokenSpans(node, sourceCode);
  return spans ? spans.replace : null;
}

function markupTokenSpans(node, sourceCode) {
  if (typeof node.value !== 'string' || !Array.isArray(node.range) || typeof sourceCode.text !== 'string') {
    return null;
  }

  const text = sourceCode.text.slice(node.range[0], node.range[1]);
  const candidates = [{ body: text, offset: node.range[0] }];
  const quote = text[0];
  if ((quote === '"' || quote === "'") && text.length >= 2 && text[text.length - 1] === quote) {
    candidates.push({ body: text.slice(1, -1), offset: node.range[0] + 1 });
  }

  for (const { body, offset } of candidates) {
    const pieces = alignJsxAttributeBody(body, node.value);
    if (pieces && pieces.map((piece) => piece.text).join('') === node.value) {
      return tokenSpans(body, offset, pieces, (replacement) => UNSAFE_IN_MARKUP.test(replacement));
    }
  }

  return null;
}

// A template chunk replacement may not open an interpolation, close the
// template or start an escape.
const UNSAFE_IN_TEMPLATE = /[`$\\\n\r\u2028\u2029]/;

/**
 * Spans for the static text of a template literal chunk (a TemplateElement).
 * ESLint and typescript-eslint include the delimiters in its range (the
 * backtick or `}` before, the backtick or `${` after); a host that does not
 * is handled too. Fixes are given only when the cooked value equals the raw
 * text, so every decoded offset is its own source offset (fix-10). A chunk
 * with an escape still gets token locations when its raw text decodes to
 * the cooked value, but no fixes.
 */
function templateTokenSpans(node, sourceCode) {
  const value = node.value;
  if (node.type !== 'TemplateElement' || !value || typeof value.raw !== 'string' || !Array.isArray(node.range) || typeof sourceCode.text !== 'string') {
    return null;
  }

  const raw = value.raw;
  const text = sourceCode.text.slice(node.range[0], node.range[1]);
  const offsets = /^[`}]/.test(text) ? [1, 0] : [0];
  const offset = offsets.find((candidate) => text.startsWith(raw, candidate) && /^(?:`|\$\{)?$/.test(text.slice(candidate + raw.length)));
  if (offset === undefined) {
    return null;
  }

  const cooked = typeof value.cooked === 'string' ? value.cooked : null;
  if (cooked === raw) {
    const pieces = Array.from({ length: raw.length }, (unused, index) => ({ end: index + 1, start: index, text: raw[index] }));
    return tokenSpans(raw, node.range[0] + offset, pieces, (replacement) => UNSAFE_IN_TEMPLATE.test(replacement));
  }

  const pieces = cooked === null ? null : decodeJsStringBody(raw);
  if (!pieces || pieces.map((piece) => piece.text).join('') !== cooked) {
    return null;
  }
  return tokenSpans(raw, node.range[0] + offset, pieces, () => true);
}

/**
 * The shared part of the span mappers: maps a token at a decoded offset back
 * to its raw span. `locate` gives that span as source offsets, for a report
 * location; `replace` gives a fix only when the span is exactly the token
 * text and the replacement is safe in the literal.
 */
function tokenSpans(body, bodyOffset, pieces, isUnsafe) {
  const rawStarts = [];
  const rawEnds = [];
  for (const piece of pieces) {
    for (let unit = 0; unit < piece.text.length; unit += 1) {
      rawStarts.push(piece.start);
      rawEnds.push(piece.end);
    }
  }

  function rawSpan(start, token) {
    const end = start + token.length;
    if (token.length === 0 || start < 0 || end > rawStarts.length) {
      return null;
    }
    return [rawStarts[start], rawEnds[end - 1]];
  }

  return {
    locate(start, token) {
      const span = rawSpan(start, token);
      return span ? [bodyOffset + span[0], bodyOffset + span[1]] : null;
    },
    replace(start, token, replacement) {
      if (typeof replacement !== 'string' || replacement === token || isUnsafe(replacement)) {
        return null;
      }
      const span = rawSpan(start, token);
      if (!span || body.slice(span[0], span[1]) !== token) {
        return null;
      }
      const range = [bodyOffset + span[0], bodyOffset + span[1]];
      return (fixer) => fixer.replaceTextRange(range, replacement);
    },
  };
}

/**
 * The span mapper for any node a class string rule visits: string literals,
 * template literal chunks, and the static attribute text of Vue and Svelte
 * templates. Null when the node's source cannot be aligned with its value.
 */
function createTokenSpans(node, sourceCode) {
  if (node.type === 'VLiteral' || node.type === 'SvelteLiteral') {
    return markupTokenSpans(node, sourceCode);
  }
  if (node.type === 'TemplateElement') {
    return templateTokenSpans(node, sourceCode);
  }
  return literalTokenSpans(node, sourceCode);
}

/**
 * The token fixer for string literals and the static attribute text of Vue
 * and Svelte templates (not template literal chunks).
 */
function createTokenFixer(node, sourceCode) {
  if (node.type === 'TemplateElement') {
    return null;
  }
  const spans = createTokenSpans(node, sourceCode);
  return spans ? spans.replace : null;
}

/**
 * True for the static text of a `class` attribute in a Vue template
 * (`<div class="p-[13px]">`, a `VLiteral` in a non-directive `VAttribute`) or
 * a Svelte component (`<div class="p-[13px] {x}">`, a `SvelteLiteral` in a
 * `SvelteAttribute`). Bound classes (`:class="..."`, `class={...}`) are
 * expressions, and their strings are ordinary literals. `isClassName` adds
 * attribute names (the rule's `classContexts`); `class` always counts.
 */
function isClassAttributeText(node, isClassName = () => false) {
  const attribute = node.parent;
  if (!attribute || !attribute.key) {
    return false;
  }
  if (node.type === 'VLiteral') {
    return attribute.type === 'VAttribute'
      && attribute.directive === false
      && attribute.value === node
      && (String(attribute.key.name).toLowerCase() === 'class' || isClassName(attribute.key.name));
  }
  if (node.type === 'SvelteLiteral') {
    return attribute.type === 'SvelteAttribute'
      && Array.isArray(attribute.value)
      && attribute.value.includes(node)
      && (attribute.key.name === 'class' || isClassName(attribute.key.name));
  }
  return false;
}

/**
 * The text a class string rule should analyze: the decoded value of a string
 * Literal, or the cooked value of a TemplateElement (its raw text when the
 * cooked value is null, as in a tagged template with an invalid escape), or
 * the value of a Vue `VLiteral` or Svelte `SvelteLiteral`.
 */
function classStringValue(node) {
  if (node.type === 'Literal') {
    return typeof node.value === 'string' ? node.value : null;
  }
  if (node.type === 'TemplateElement' && node.value) {
    return typeof node.value.cooked === 'string' ? node.value.cooked : node.value.raw;
  }
  if (node.type === 'VLiteral' || node.type === 'SvelteLiteral') {
    return typeof node.value === 'string' ? node.value : null;
  }
  return null;
}

module.exports = {
  classStringValue,
  createLiteralTokenFixer,
  createMarkupTextFixer,
  createTokenFixer,
  createTokenSpans,
  isClassAttributeText,
};
