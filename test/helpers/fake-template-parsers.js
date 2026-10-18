'use strict';

/**
 * Minimal stand-ins for vue-eslint-parser and svelte-eslint-parser, so the
 * ESLint rule's template support is tested without installing either (#244).
 *
 * They build only what the rule reads, in the shapes the real parsers
 * document: vue-eslint-parser puts `<template>` in `Program.templateBody`
 * (VElement > VStartTag > VAttribute > VLiteral | VExpressionContainer) and
 * walks it from `parserServices.defineTemplateBodyVisitor` on `Program:exit`;
 * svelte-eslint-parser puts markup in the main tree (SvelteElement >
 * SvelteStartTag > SvelteAttribute { key: SvelteName, value: [SvelteLiteral |
 * SvelteMustacheTag] }) with its own visitor keys. Script content is parsed by
 * espree at its real offsets; everything else is blanked out.
 */

const espree = require('espree');
const { KEYS } = require('eslint-visitor-keys');

const PARSE_OPTIONS = { comment: true, ecmaVersion: 'latest', loc: true, range: true, sourceType: 'module', tokens: true };

function blank(text) {
  return text.replace(/[^\n]/g, ' ');
}

function locate(code, offset) {
  const before = code.slice(0, offset);
  const line = before.split('\n').length;
  return { column: offset - (before.lastIndexOf('\n') + 1), line };
}

function withLoc(code, node) {
  node.loc = { end: locate(code, node.range[1]), start: locate(code, node.range[0]) };
  return node;
}

function parseScript(code) {
  const match = /<script[^>]*>([\s\S]*?)<\/script>/.exec(code);
  if (!match) {
    return espree.parse(blank(code), PARSE_OPTIONS);
  }
  const start = match.index + match[0].indexOf('>') + 1;
  const end = start + match[1].length;
  return espree.parse(blank(code.slice(0, start)) + match[1] + blank(code.slice(end)), PARSE_OPTIONS);
}

/** An expression parsed at its real offset, wrapped in parentheses that replace the quotes. */
function parseExpressionAt(code, start, end) {
  const program = espree.parse(`${blank(code.slice(0, start - 1))}(${code.slice(start, end)})`, { ...PARSE_OPTIONS, sourceType: 'script' });
  return program.body[0].expression;
}

function decodeEntities(text) {
  return text.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
}

/** Attributes of every start tag in [from, to): name, quoted value and offsets. */
function* startTagAttributes(code, from, to) {
  const tagRegex = /<([a-zA-Z][\w-]*)([^>]*)>/g;
  tagRegex.lastIndex = from;
  let tag;
  while ((tag = tagRegex.exec(code)) !== null && tag.index < to) {
    if (tag[1] === 'script' || tag[1] === 'template') {
      continue;
    }
    const attributesStart = tag.index + 1 + tag[1].length;
    const attributeRegex = /([:@]?[\w-]+)=("([^"]*)"|'([^']*)')/g;
    const attributes = [];
    let attribute;
    while ((attribute = attributeRegex.exec(tag[2])) !== null) {
      const start = attributesStart + attribute.index;
      const valueStart = start + attribute[1].length + 1;
      attributes.push({
        end: valueStart + attribute[2].length,
        name: attribute[1],
        start,
        valueStart,
        valueText: attribute[3] ?? attribute[4],
      });
    }
    yield { attributes, end: tag.index + tag[0].length, start: tag.index };
  }
}

const VUE_TEMPLATE_KEYS = {
  VAttribute: ['key', 'value'],
  VElement: ['startTag', 'children'],
  VExpressionContainer: ['expression'],
  VStartTag: ['attributes'],
};

function vueAttribute(code, attribute) {
  const directive = attribute.name.startsWith(':');
  const node = withLoc(code, { directive, range: [attribute.start, attribute.end], type: 'VAttribute' });
  node.key = withLoc(code, {
    name: directive ? attribute.name.slice(1) : attribute.name,
    range: [attribute.start, attribute.start + attribute.name.length],
    type: directive ? 'VDirectiveKey' : 'VIdentifier',
  });
  if (directive) {
    node.value = withLoc(code, { range: [attribute.valueStart, attribute.end], type: 'VExpressionContainer' });
    node.value.expression = parseExpressionAt(code, attribute.valueStart + 1, attribute.end - 1);
  } else {
    node.value = withLoc(code, {
      range: [attribute.valueStart, attribute.end],
      type: 'VLiteral',
      value: decodeEntities(attribute.valueText),
    });
  }
  return node;
}

function setParents(node, parent, keys) {
  node.parent = parent;
  for (const key of keys[node.type] || KEYS[node.type] || []) {
    const children = Array.isArray(node[key]) ? node[key] : [node[key]];
    for (const child of children) {
      if (child && typeof child.type === 'string') {
        setParents(child, node, keys);
      }
    }
  }
}

function walk(node, visitor, keys) {
  if (typeof visitor[node.type] === 'function') {
    visitor[node.type](node);
  }
  for (const key of keys[node.type] || KEYS[node.type] || []) {
    const children = Array.isArray(node[key]) ? node[key] : [node[key]];
    for (const child of children) {
      if (child && typeof child.type === 'string') {
        walk(child, visitor, keys);
      }
    }
  }
}

const fakeVueParser = {
  meta: { name: 'fake-vue-eslint-parser' },
  parseForESLint(code) {
    const ast = parseScript(code);
    const template = /<template>([\s\S]*)<\/template>/.exec(code);
    ast.templateBody = null;

    if (template) {
      const start = template.index;
      const end = start + template[0].length;
      const root = withLoc(code, { children: [], range: [start, end], type: 'VElement' });
      for (const tag of startTagAttributes(code, start, end)) {
        const element = withLoc(code, { children: [], range: [tag.start, tag.end], type: 'VElement' });
        element.startTag = withLoc(code, { range: [tag.start, tag.end], type: 'VStartTag' });
        element.startTag.attributes = tag.attributes.map((attribute) => vueAttribute(code, attribute));
        root.children.push(element);
      }
      setParents(root, ast, VUE_TEMPLATE_KEYS);
      ast.templateBody = root;
    }

    return {
      ast,
      services: {
        defineTemplateBodyVisitor(templateVisitor, scriptVisitor = {}) {
          if (!ast.templateBody) {
            return scriptVisitor;
          }
          const programExit = scriptVisitor['Program:exit'];
          return {
            ...scriptVisitor,
            'Program:exit'(node) {
              walk(ast.templateBody, templateVisitor, VUE_TEMPLATE_KEYS);
              if (programExit) {
                programExit(node);
              }
            },
          };
        },
      },
    };
  },
};

const SVELTE_KEYS = {
  ...KEYS,
  SvelteAttribute: ['key', 'value'],
  SvelteElement: ['startTag', 'children'],
  SvelteLiteral: [],
  SvelteMustacheTag: ['expression'],
  SvelteName: [],
  SvelteStartTag: ['attributes'],
};

function svelteAttribute(code, attribute) {
  const node = withLoc(code, { range: [attribute.start, attribute.end], type: 'SvelteAttribute' });
  node.key = withLoc(code, { name: attribute.name, range: [attribute.start, attribute.start + attribute.name.length], type: 'SvelteName' });
  node.value = [];
  const textStart = attribute.valueStart + 1;
  const mustache = /\{([^}]*)\}/g;
  let cursor = 0;
  let match;
  const pushLiteral = (from, to) => {
    if (to > from) {
      node.value.push(withLoc(code, {
        range: [textStart + from, textStart + to],
        type: 'SvelteLiteral',
        value: attribute.valueText.slice(from, to),
      }));
    }
  };
  while ((match = mustache.exec(attribute.valueText)) !== null) {
    pushLiteral(cursor, match.index);
    const tag = withLoc(code, {
      kind: 'text',
      range: [textStart + match.index, textStart + match.index + match[0].length],
      type: 'SvelteMustacheTag',
    });
    tag.expression = parseExpressionAt(code, textStart + match.index + 1, textStart + match.index + match[0].length - 1);
    node.value.push(tag);
    cursor = match.index + match[0].length;
  }
  pushLiteral(cursor, attribute.valueText.length);
  return node;
}

const fakeSvelteParser = {
  meta: { name: 'fake-svelte-eslint-parser' },
  parseForESLint(code) {
    const ast = parseScript(code);
    for (const tag of startTagAttributes(code, 0, code.length)) {
      const element = withLoc(code, { children: [], range: [tag.start, tag.end], type: 'SvelteElement' });
      element.startTag = withLoc(code, { range: [tag.start, tag.end], type: 'SvelteStartTag' });
      element.startTag.attributes = tag.attributes.map((attribute) => svelteAttribute(code, attribute));
      ast.body.push(element);
    }
    return { ast, services: {}, visitorKeys: SVELTE_KEYS };
  },
};

module.exports = { fakeSvelteParser, fakeVueParser };
