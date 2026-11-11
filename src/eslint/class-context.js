'use strict';

/**
 * Decides whether a string the ESLint rule visits is a class string (cs-04,
 * fix-09). The JS and TS path used to check every Literal and TemplateElement,
 * so `eslint --fix` rewrote type unions, enum members, `aria-label`, `title`,
 * `id` and `data-*` values and prose. Now a string is checked when it sits in
 * a class context, or, anywhere else, when it holds two or more
 * utility-shaped tokens.
 *
 * The walk only reads `node.parent`, so it runs under any host that sets
 * parents (ESLint, vue-eslint-parser and svelte-eslint-parser templates,
 * Oxlint JS plugins); it needs no scope analysis.
 */

// Callee and tag names whose string arguments are class strings. `tw` covers
// `tw\`...\`` and `tw.div\`...\`` tagged templates as well as `tw(...)` calls.
const DEFAULT_CLASS_FUNCTIONS = ['cn', 'clsx', 'classnames', 'cx', 'cva', 'tv', 'twMerge', 'twJoin', 'tw'];

// JSX attribute (and object property) names whose values are class strings.
// An entry starting with `*` matches by suffix: `*ClassName` covers
// `contentClassName`, `wrapperClassName` and the like.
const DEFAULT_CLASS_CONTEXTS = ['class', 'className', '*ClassName'];

const CLASS = 'class';
const SKIP = 'skip';
const OTHER = 'other';

// Expression wrappers a class string passes through on its way up to the
// call, attribute or property that decides its context.
const PASS_THROUGH = new Set([
  'ArrayExpression',
  'ChainExpression',
  'JSXExpressionContainer',
  'ObjectExpression',
  'ParenthesizedExpression',
  'SpreadElement',
  'SvelteMustacheTag',
  'TSAsExpression',
  'TSNonNullExpression',
  'TSSatisfiesExpression',
  'TSTypeAssertion',
  'TemplateLiteral',
  'VExpressionContainer',
]);

// Svelte directives (`use:`, `style:`, `class:`, `bind:`, `on:` and friends)
// hold expressions, never class text.
const SVELTE_DIRECTIVES = new Set([
  'SvelteDirective',
  'SvelteGenericsDirective',
  'SvelteSpecialDirective',
  'SvelteStyleDirective',
]);

const MAX_DEPTH = 64;

function nameMatcher(names) {
  const exact = new Set();
  const suffixes = [];
  for (const name of names) {
    if (typeof name !== 'string' || name.length === 0) {
      continue;
    }
    if (name.startsWith('*') && name.length > 1) {
      suffixes.push(name.slice(1));
    } else {
      exact.add(name);
    }
  }
  return (name) => typeof name === 'string'
    && (exact.has(name) || suffixes.some((suffix) => name.length > suffix.length && name.endsWith(suffix)));
}

/**
 * `classFunctions` and `classContexts` extend the defaults; they never
 * replace them.
 */
function createClassContextMatchers(option = {}) {
  const functions = [...DEFAULT_CLASS_FUNCTIONS, ...(Array.isArray(option.classFunctions) ? option.classFunctions : [])];
  const contexts = [...DEFAULT_CLASS_CONTEXTS, ...(Array.isArray(option.classContexts) ? option.classContexts : [])];
  return {
    isClassContextName: nameMatcher(contexts),
    isClassFunctionName: nameMatcher(functions),
  };
}

function jsxAttributeName(attribute) {
  const { name } = attribute;
  if (!name) {
    return null;
  }
  if (name.type === 'JSXNamespacedName') {
    return `${name.namespace.name}:${name.name.name}`;
  }
  return typeof name.name === 'string' ? name.name : null;
}

function propertyKeyName(property) {
  const { key } = property;
  if (!key || property.computed) {
    return null;
  }
  if (key.type === 'Identifier') {
    return key.name;
  }
  if (key.type === 'Literal' && typeof key.value === 'string') {
    return key.value;
  }
  return null;
}

/** `cn`, `utils.cn`, `tw.div`, `tw(Button)`: the name a call or tag is matched by. */
function calleeNames(callee) {
  const names = [];
  let current = callee;
  for (let depth = 0; current && depth < MAX_DEPTH; depth += 1) {
    if (current.type === 'Identifier') {
      names.push(current.name);
      break;
    }
    if (current.type === 'MemberExpression') {
      if (!current.computed && current.property && current.property.type === 'Identifier') {
        names.push(current.property.name);
      }
      current = current.object;
      continue;
    }
    if (current.type === 'CallExpression') {
      current = current.callee;
      continue;
    }
    break;
  }
  return names;
}

function vueAttributeContext(attribute, matchers) {
  const { key } = attribute;
  if (!attribute.directive || !key) {
    return SKIP;
  }
  // vue-eslint-parser: `:class` and `v-bind:class` are a VDirectiveKey whose
  // name is the `bind` VIdentifier and whose argument names the attribute.
  const directive = key.name && typeof key.name === 'object' ? key.name.name : key.name;
  const argument = key.argument && key.argument.type === 'VIdentifier' ? key.argument.name : null;
  if (directive === 'bind' && argument && matchers.isClassContextName(argument)) {
    return CLASS;
  }
  return SKIP;
}

/**
 * Where a string node sits: CLASS (check it), SKIP (never check it: type
 * positions, enum members, non-class markup attributes) or OTHER (check it
 * only when it looks like a class list).
 */
function classContextOf(node, matchers) {
  let child = node;
  let parent = node.parent;

  for (let depth = 0; parent && depth < MAX_DEPTH; depth += 1) {
    switch (parent.type) {
      case 'JSXAttribute':
        return matchers.isClassContextName(jsxAttributeName(parent)) ? CLASS : SKIP;
      case 'VAttribute':
        return vueAttributeContext(parent, matchers);
      case 'SvelteAttribute':
        return parent.key && matchers.isClassContextName(parent.key.name) ? CLASS : SKIP;
      case 'CallExpression':
        if (!parent.arguments || !parent.arguments.includes(child)) {
          return OTHER;
        }
        if (calleeNames(parent.callee).some(matchers.isClassFunctionName)) {
          return CLASS;
        }
        // Any other call decides nothing by itself: its argument is a class
        // string when the call sits in a class context
        // (`className={mergeClasses('p-4')}`), skipped under a non-class
        // attribute (`title={t('p-4')}`), and judged by its tokens elsewhere.
        break;
      case 'TaggedTemplateExpression':
        if (parent.quasi === child) {
          return calleeNames(parent.tag).some(matchers.isClassFunctionName) ? CLASS : OTHER;
        }
        return OTHER;
      case 'Property':
        if (parent.value === child && matchers.isClassContextName(propertyKeyName(parent))) {
          return CLASS;
        }
        break;
      case 'ConditionalExpression':
        if (parent.test === child) {
          return OTHER;
        }
        break;
      case 'LogicalExpression':
        break;
      case 'BinaryExpression':
        if (parent.operator !== '+') {
          return OTHER;
        }
        break;
      case 'ArrowFunctionExpression':
        if (parent.body !== child) {
          return OTHER;
        }
        break;
      default:
        if (SVELTE_DIRECTIVES.has(parent.type)) {
          return SKIP;
        }
        if (PASS_THROUGH.has(parent.type)) {
          break;
        }
        // TSLiteralType, TSEnumMember, TSTemplateLiteralType and every other
        // type position: a string there is a type, not a value.
        if (parent.type.startsWith('TS')) {
          return SKIP;
        }
        return OTHER;
    }
    child = parent;
    parent = parent.parent;
  }

  return OTHER;
}

/*
 * A conservative "utility-shaped" test for strings outside class contexts.
 * After the variant prefix (`md:`, `hover:`), the important marker and a
 * leading `-` are removed, a token is utility-shaped when it is
 * - an arbitrary value: `p-[13px]`, `bg-[#fff]`, `w-(--x)`;
 * - a numeric step or fraction: `p-4`, `gap-2.5`, `w-1/2`, `bg-red-500`;
 * - a size keyword step: `text-sm`, `rounded-lg`, `w-full`, `h-screen`, `m-auto`;
 * - or one of a short list of keyword utilities (`flex`, `hidden`, `items-center`).
 * Capitalised words, plain words and words with a colon but no utility after
 * it are not, so prose such as "Error in p-[13px] string" holds one.
 */
const ARBITRARY_TOKEN = /^[a-z][a-z0-9-]*-(?:\[[^\]\s]+\]|\([^)\s]+\))$/;
const NUMERIC_TOKEN = /^[a-z][a-z-]*-\d+(?:\.\d+)?(?:\/\d+)?$/;
const SIZE_TOKEN = /^[a-z][a-z-]*-(?:xs|sm|base|md|lg|xl|[2-9]xl|full|screen|auto|px|none|fit|min|max)$/;
const KEYWORD_UTILITIES = new Set([
  'absolute', 'antialiased', 'block', 'border', 'capitalize', 'container', 'contents', 'fixed', 'flex',
  'flex-col', 'flex-row', 'flex-wrap', 'grid', 'grow', 'hidden', 'inline', 'inline-block', 'inline-flex',
  'inline-grid', 'invisible', 'isolate', 'italic', 'items-baseline', 'items-center', 'items-end',
  'items-start', 'items-stretch', 'justify-around', 'justify-between', 'justify-center', 'justify-end',
  'justify-evenly', 'justify-start', 'lowercase', 'relative', 'rounded', 'shadow', 'shrink', 'sr-only',
  'static', 'sticky', 'table', 'transition', 'truncate', 'underline', 'uppercase', 'visible',
]);

function utilityCandidate(token) {
  let depth = 0;
  let separator = -1;
  for (let index = 0; index < token.length; index += 1) {
    const character = token[index];
    if (character === '[' || character === '(') {
      depth += 1;
    } else if ((character === ']' || character === ')') && depth > 0) {
      depth -= 1;
    } else if (character === ':' && depth === 0) {
      separator = index;
    }
  }
  let candidate = token.slice(separator + 1);
  if (candidate.startsWith('!')) {
    candidate = candidate.slice(1);
  } else if (candidate.endsWith('!')) {
    candidate = candidate.slice(0, -1);
  }
  if (candidate.startsWith('-')) {
    candidate = candidate.slice(1);
  }
  return candidate;
}

function isUtilityShaped(token) {
  const candidate = utilityCandidate(token);
  return KEYWORD_UTILITIES.has(candidate)
    || ARBITRARY_TOKEN.test(candidate)
    || NUMERIC_TOKEN.test(candidate)
    || SIZE_TOKEN.test(candidate);
}

function countUtilityShapedTokens(text) {
  let count = 0;
  for (const token of text.split(/\s+/)) {
    if (token && isUtilityShaped(token)) {
      count += 1;
    }
  }
  return count;
}

/**
 * The static text a string contributes to a class list: a template chunk is
 * judged with the other chunks of its template literal.
 */
function staticTextOf(node, value) {
  const template = node.type === 'TemplateElement' ? node.parent : null;
  if (template && Array.isArray(template.quasis)) {
    return template.quasis
      .map((quasi) => (quasi.value && typeof quasi.value.cooked === 'string' ? quasi.value.cooked : (quasi.value && quasi.value.raw) || ''))
      .join(' ');
  }
  return value;
}

/** True when the rule should check this string node. */
function isClassString(node, value, matchers) {
  const context = classContextOf(node, matchers);
  if (context === CLASS) {
    return true;
  }
  if (context === SKIP) {
    return false;
  }
  return countUtilityShapedTokens(staticTextOf(node, value)) >= 2;
}

module.exports = {
  DEFAULT_CLASS_CONTEXTS,
  DEFAULT_CLASS_FUNCTIONS,
  classContextOf,
  countUtilityShapedTokens,
  createClassContextMatchers,
  isClassString,
  isUtilityShaped,
};
