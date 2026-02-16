'use strict';

const path = require('node:path');

const pluginPath = path.join(__dirname, '..', '..', 'src', 'index.js');

async function lintCss({ code, fix = false, rules }) {
  const { default: stylelint } = await import('stylelint');
  const lintResult = await stylelint.lint({
    code,
    config: {
      plugins: [pluginPath],
      rules,
    },
    fix,
  });

  const result = lintResult.results[0];
  let fixedCode = code;

  if (fix) {
    if (typeof lintResult.code === 'string' && lintResult.code.length > 0) {
      fixedCode = lintResult.code;
    } else if (
      Object.prototype.hasOwnProperty.call(lintResult, 'output') &&
      typeof lintResult.output === 'string' &&
      lintResult.output.length > 0
    ) {
      fixedCode = lintResult.output;
    }
  }

  return {
    code: fixedCode,
    errored: result.errored,
    warnings: result.warnings,
  };
}

module.exports = {
  lintCss,
};
