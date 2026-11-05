'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');

const { auditCommand, lintGlob, stylelintInstallLine } = require('../../src/audit/next-steps');

const cwd = path.join(path.sep, 'project');
const at = (...files) => files.map((file) => path.join(cwd, ...file.split('/')));

test('the lint glob follows where the stylesheets are and which extensions occur', () => {
  assert.equal(lintGlob(cwd, at('src/a.css', 'src/b/c.css')), 'src/**/*.css');
  assert.equal(lintGlob(cwd, at('styles/main.scss', 'styles/_v.scss')), 'styles/**/*.scss');
  assert.equal(lintGlob(cwd, at('app/a.css', 'components/b.scss')), '**/*.{css,scss}');
  assert.equal(lintGlob(cwd, at('a.css')), '**/*.css');
  assert.equal(lintGlob(cwd, []), '**/*.css');
});

test('a directory name that a shell would expand never reaches the printed glob', () => {
  for (const name of ['$(touch pwned)', '`id`', 'a"b', "it's", 'a b', '$HOME']) {
    assert.equal(lintGlob(cwd, at(`${name}/a.css`)), '**/*.css', name);
  }
});

test('the install line quotes the Stylelint range and the audit command quotes paths', () => {
  assert.match(stylelintInstallLine({ scss: true, tailwindConfig: true }), /^npm install --save-dev "stylelint@[^"]+" stylelint-plugin-rhythmguard stylelint-config-tailwindcss postcss-scss$/);
  assert.equal(auditCommand({ dir: '$(id)', scale: 'auto', tokenSources: ['./a b.json'] }), "npx rhythmguard audit '$(id)' --scale auto --token-source './a b.json'");
});
