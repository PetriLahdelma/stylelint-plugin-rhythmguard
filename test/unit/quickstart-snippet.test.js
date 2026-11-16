'use strict';

/**
 * The quickstart prints an eslint.config.js block to paste. Its paths come
 * from file names in the project, so a name with a quote must stay a string
 * and never become code in the user's config.
 */
const assert = require('node:assert/strict');
const test = require('node:test');
const vm = require('node:vm');

const { eslintSnippet } = require('../../src/cli/quickstart');

function evaluate(snippet) {
  const body = snippet.replace(/^import .*$/gm, '').replace('export default', 'result =');
  // Out of the sandbox's realm, so deepEqual compares values only.
  return JSON.parse(JSON.stringify(vm.runInNewContext(`var rhythmguard = {}; var tseslint = {}; var result; ${body}; result`, {})));
}

test('a file name with quotes, backslashes or newlines stays one string in the pasted config', () => {
  const hostile = "./x'); require('child_process').exec('id'); //.css";
  const config = evaluate(eslintSnippet({ scaleSources: [hostile, 'a\\b\nc.css'], tailwindCss: "it's.css" }));
  assert.deepEqual(config[0].rules['rhythmguard-tailwind/tailwind-class-use-scale'], ['error', { scaleSources: [hostile, 'a\\b\nc.css'], tailwindCss: "it's.css" }]);
});

test('only the known option names are written', () => {
  const config = evaluate(eslintSnippet({ 'constructor: 1, x': 'y', scale: 'auto' }));
  assert.deepEqual(config[0].rules['rhythmguard-tailwind/tailwind-class-use-scale'], ['error', { scale: 'auto' }]);
});
