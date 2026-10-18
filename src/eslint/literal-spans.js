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

  const rawStarts = [];
  const rawEnds = [];
  for (const piece of pieces) {
    for (let unit = 0; unit < piece.text.length; unit += 1) {
      rawStarts.push(piece.start);
      rawEnds.push(piece.end);
    }
  }

  const bodyOffset = node.range[0] + 1;

  return function replace(start, token, replacement) {
    if (typeof replacement !== 'string' || replacement === token || token.length === 0) {
      return null;
    }
    if (
      replacement.includes(quote)
      || replacement.includes('\\')
      || LINE_TERMINATOR.test(replacement)
      || (jsx && replacement.includes('&'))
    ) {
      return null;
    }

    const end = start + token.length;
    if (start < 0 || end > rawStarts.length) {
      return null;
    }

    const rawStart = rawStarts[start];
    const rawEnd = rawEnds[end - 1];
    if (body.slice(rawStart, rawEnd) !== token) {
      return null;
    }

    const range = [bodyOffset + rawStart, bodyOffset + rawEnd];
    return (fixer) => fixer.replaceTextRange(range, replacement);
  };
}

/**
 * The text a class string rule should analyze: the decoded value of a string
 * Literal, or the cooked value of a TemplateElement (its raw text when the
 * cooked value is null, as in a tagged template with an invalid escape).
 */
function classStringValue(node) {
  if (node.type === 'Literal') {
    return typeof node.value === 'string' ? node.value : null;
  }
  if (node.type === 'TemplateElement' && node.value) {
    return typeof node.value.cooked === 'string' ? node.value.cooked : node.value.raw;
  }
  return null;
}

module.exports = {
  classStringValue,
  createLiteralTokenFixer,
};
