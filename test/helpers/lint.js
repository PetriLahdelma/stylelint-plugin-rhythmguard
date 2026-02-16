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
  return {
    code: lintResult.code || code,
    errored: result.errored,
    warnings: result.warnings,
  };
}

module.exports = {
  lintCss,
};
