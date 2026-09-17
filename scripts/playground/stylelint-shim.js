'use strict';

/**
 * The slice of Stylelint's API the rules use, for the browser bundle: enough to
 * run the real rule functions on a PostCSS root and collect what they report.
 * Warnings carry the same message, line and column Stylelint would give; fixes
 * run when the result was created with `fix: true`.
 */

function createPlugin(ruleName, rule) {
  rule.ruleName = ruleName;
  return { rule, ruleName };
}

function ruleMessages(ruleName, messages) {
  const wrapped = {};
  for (const [name, fn] of Object.entries(messages)) {
    wrapped[name] = typeof fn === 'function'
      ? (...args) => `${fn(...args)} (${ruleName})`
      : `${fn} (${ruleName})`;
  }
  return wrapped;
}

function report({ endIndex, fix, index, message, node, result, ruleName }) {
  if (result.stylelint.fix && typeof fix === 'function') {
    fix();
    result.stylelint.fixed += 1;
    return;
  }
  let line = 1;
  let column = 1;
  let endLine;
  let endColumn;
  if (node && typeof node.rangeBy === 'function') {
    const range = node.rangeBy(typeof index === 'number' ? { endIndex, index } : {});
    line = range.start.line;
    column = range.start.column;
    endLine = range.end.line;
    endColumn = range.end.column;
  } else if (node && node.source && node.source.start) {
    line = node.source.start.line;
    column = node.source.start.column;
  }
  result.warnings.push({ column, endColumn, endLine, line, rule: ruleName, severity: result.stylelint.severity, text: message });
}

function isAllowed(value, possible) {
  const candidates = Array.isArray(possible) ? possible : [possible];
  return candidates.some((candidate) => (typeof candidate === 'function' ? candidate(value) : candidate === value));
}

/** Stylelint's validateOptions, reduced to the shapes the rules use. */
function validateOptions(result, ruleName, ...descriptions) {
  let valid = true;
  const invalid = (message) => {
    valid = false;
    result.warn(`${message} for rule "${ruleName}"`, { stylelintType: 'invalidOption' });
    result.stylelint.stylelintError = true;
  };
  for (const { actual, optional, possible } of descriptions) {
    if (actual === undefined || actual === null) {
      if (!optional) invalid('Expected option value');
      continue;
    }
    if (Array.isArray(possible) || typeof possible === 'function') {
      if (!isAllowed(actual, possible)) invalid(`Invalid option value ${JSON.stringify(actual)}`);
      continue;
    }
    if (typeof possible === 'object') {
      if (typeof actual !== 'object' || Array.isArray(actual)) {
        invalid(`Invalid option value ${JSON.stringify(actual)}`);
        continue;
      }
      for (const [key, value] of Object.entries(actual)) {
        if (!(key in possible)) {
          invalid(`Invalid option name "${key}"`);
          continue;
        }
        const values = Array.isArray(value) && Array.isArray(possible[key]) && possible[key].some((p) => typeof p === 'function')
          ? value
          : [value];
        for (const entry of values) {
          if (!isAllowed(entry, possible[key])) invalid(`Invalid value ${JSON.stringify(entry)} for option "${key}"`);
        }
      }
    }
  }
  return valid;
}

module.exports = {
  createPlugin,
  utils: { report, ruleMessages, validateOptions },
};
