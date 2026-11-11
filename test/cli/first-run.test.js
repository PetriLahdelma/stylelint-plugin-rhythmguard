'use strict';

/**
 * The quickstart's printed steps, checked on five stacks (dx-01, dx-04, dx-05,
 * dx-10, dx-11): every package the pasted config or snippet needs is in a
 * printed install line, the printed Stylelint glob lints at least one file with
 * the pasted config and finds the off-scale value, and the next steps propose a
 * reviewable decision instead of a blind `stylelint --fix`.
 *
 * Packages are not installed here; the config resolves from this checkout
 * (configBasedir), so this tests the printed text, not npm.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { spawnSync } = require('node:child_process');

const root = path.join(__dirname, '..', '..');
const cliPath = path.join(root, 'src', 'cli', 'index.js');

const STACKS = {
  'CSS tokens': {
    'package.json': '{"name":"css-app"}',
    'src/tokens.css': ':root { --space-1: 4px; --space-2: 8px; --space-3: 12px; --space-4: 16px; }\n',
    'src/app.css': '.a { padding: 13px; }\n',
  },
  SCSS: {
    'package.json': '{"name":"scss-app"}',
    'styles/_variables.scss': '$spacing: (1: 4px, 2: 8px, 3: 12px, 4: 16px);\n',
    'styles/main.scss': '.a { padding: 13px; }\n',
  },
  'Tailwind v4 TSX': {
    'package.json': '{"name":"tw-app","dependencies":{"tailwindcss":"^4.3.0"}}',
    'src/app.css': '@import "tailwindcss";\n@theme { --spacing: 0.25rem; }\n.x { margin: 13px; }\n',
    'src/components/Button.tsx': 'export const B = () => <button className="p-[13px]" />;\n',
  },
  DTCG: {
    'package.json': '{"name":"dtcg-app"}',
    'tokens/tokens.json': '{"space":{"$type":"dimension","1":{"$value":{"value":4,"unit":"px"}},"2":{"$value":{"value":8,"unit":"px"}},"3":{"$value":{"value":12,"unit":"px"}},"4":{"$value":{"value":16,"unit":"px"}}}}\n',
    'app/page.module.css': '.a { padding: 13px; }\n',
    'components/card.module.css': '.c { gap: 12px; }\n',
  },
  'Tailwind v3 JSX, no stylesheet at the root': {
    'package.json': '{"name":"tw3-app","devDependencies":{"tailwindcss":"^3.4.0"}}',
    'web/styles/site.css': '.hero { margin-top: 13px; }\n',
    'web/pages/index.jsx': 'export const P = () => <main className="mt-[13px]" />;\n',
    // Found, not loaded by the quickstart; the pasted config reads it (tf-06).
    'tailwind.config.js': "module.exports = { theme: { spacing: { 0: '0px', 1: '4px', 2: '8px', 3: '12px', 4: '16px', 6: '24px', 8: '32px' } } };\n",
  },
};

function fixture(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rhythmguard-first-run-'));
  for (const [file, content] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
    fs.writeFileSync(path.join(dir, file), content);
  }
  return dir;
}

/** The JSON block after a "paste this into <file>" line, and the JS block after the eslint one. */
function pasted(stdout) {
  const stylelintAt = stdout.search(/paste this into \.stylelintrc\.json/i);
  const start = stdout.indexOf('{', stylelintAt);
  const end = stdout.indexOf('\n\n', start);
  const stylelint = JSON.parse(stdout.slice(start, end).replace(/^ {4}/gm, ''));
  const eslintAt = stdout.indexOf('Then paste this into eslint.config.js');
  const eslint = eslintAt === -1 ? null : stdout.slice(stdout.indexOf('//', eslintAt), stdout.indexOf('];', eslintAt) + 2);
  return { eslint, stylelint };
}

function installedPackages(stdout) {
  return stdout.split('\n')
    .filter((line) => /^\s*npm install --save-dev /.test(line))
    .flatMap((line) => line.trim().replace(/^npm install --save-dev /, '').match(/"[^"]+"|\S+/g))
    .map((spec) => spec.replace(/^"|"$/g, '').replace(/^(@?[^@]+)@.*$/, '$1'));
}

function neededPackages({ eslint, stylelint }) {
  const needs = new Set(['stylelint']);
  for (const entry of stylelint.extends || []) {
    needs.add(entry.startsWith('@') ? entry.split('/').slice(0, 2).join('/') : entry.split('/')[0]);
    if (entry.endsWith('/configs/tailwind')) needs.add('stylelint-config-tailwindcss');
  }
  if (stylelint.customSyntax) needs.add(stylelint.customSyntax);
  if (eslint) {
    needs.add('eslint');
    for (const match of eslint.matchAll(/from '([^']+)'/g)) needs.add(match[1]);
  }
  return [...needs].sort();
}

async function lintWithPastedConfig(dir, stylelintConfig, glob) {
  const { default: stylelint } = await import('stylelint');
  const config = {
    ...stylelintConfig,
    extends: stylelintConfig.extends.map((entry) => entry.replace(/^stylelint-plugin-rhythmguard\/configs\/(\w+)$/, path.join(root, 'src', 'configs', '$1.js'))),
  };
  return stylelint.lint({ config, configBasedir: root, cwd: dir, files: glob });
}

for (const [name, files] of Object.entries(STACKS)) {
  test(`first run on ${name}: every printed command has what it needs and lints something`, async () => {
    const dir = fixture(files);
    const run = spawnSync(process.execPath, [cliPath], { cwd: dir, encoding: 'utf8' });
    assert.equal(run.status, 0, run.stderr);
    const { stdout } = run;

    const blocks = pasted(stdout);
    const installed = installedPackages(stdout);
    for (const needed of neededPackages(blocks)) {
      assert.ok(installed.includes(needed), `${needed} is needed by the pasted config but no printed install line installs it:\n${stdout}`);
    }

    const glob = stdout.match(/npx stylelint "([^"]+)"/)[1];
    const result = await lintWithPastedConfig(dir, blocks.stylelint, glob);
    assert.ok(result.results.length > 0, `the printed glob ${glob} matches a stylesheet`);
    const warnings = result.results.flatMap((entry) => entry.warnings);
    assert.ok(warnings.some((warning) => warning.rule === 'rhythmguard/use-scale' && /"13px"/.test(warning.text)), `the pasted config reports 13px: ${JSON.stringify(warnings.map((w) => w.text))}`);
    assert.deepEqual(result.results.flatMap((entry) => entry.invalidOptionWarnings), []);

    if (blocks.eslint && Object.keys(files).some((file) => /\.tsx?$/.test(file))) {
      assert.match(blocks.eslint, /import tseslint from 'typescript-eslint'/);
      assert.match(blocks.eslint, /parser: tseslint\.parser/);
      assert.match(blocks.eslint, /files: \['\*\*\/\*\.\{js,jsx,mjs,cjs,ts,tsx\}'\]/);
    }

    assert.match(stdout, /npx rhythmguard audit \. --scale auto[^\n]* --plan/);
    assert.doesNotMatch(stdout, /stylelint --fix/);

    // The pasted config reproduces the audit (dx-02): as many use-scale problems as off-scale values reported.
    const auditCount = Number(stdout.match(/Off-scale\s+(\d+) in CSS/)[1]);
    const scaleWarnings = warnings.filter((warning) => warning.rule === 'rhythmguard/use-scale' && /off-scale value/.test(warning.text));
    assert.equal(scaleWarnings.length, auditCount, `pasted config: ${JSON.stringify(scaleWarnings.map((w) => w.text))}`);

    if (files['tailwind.config.js']) {
      assert.deepEqual(blocks.stylelint.rules['rhythmguard/use-scale'], [true, { scale: 'auto', tailwindConfigPath: './tailwind.config.js' }]);
      assert.match(stdout, /--tailwind-config \.\/tailwind\.config\.js --plan/);
    }
    // A bare `npx rhythmguard audit .` gets the same scale from the suggested rc (ai-01).
    const rc = JSON.parse(stdout.split('And this into .rhythmguardrc.json')[1].split('\n\n')[1]);
    assert.equal(rc.audit.scale, 'auto');
  });
}

test('init writes exactly the config the quickstart pastes, and the rc when asked (dx-06)', () => {
  const dir = fixture(STACKS['CSS tokens']);
  const quick = spawnSync(process.execPath, [cliPath], { cwd: dir, encoding: 'utf8' });
  const { stylelint } = pasted(quick.stdout);
  assert.deepEqual(stylelint.rules['rhythmguard/use-scale'], [true, { scale: 'auto', scaleSources: ['./src/tokens.css'] }]);

  const init = spawnSync(process.execPath, [cliPath, 'init'], { cwd: dir, encoding: 'utf8', input: 'y\ny\n' });
  assert.equal(init.status, 0, init.stderr);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dir, '.stylelintrc.json'), 'utf8')), stylelint);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dir, '.rhythmguardrc.json'), 'utf8')), { audit: { scale: 'auto' } });

  // A second run shows what it would replace before asking.
  fs.writeFileSync(path.join(dir, '.stylelintrc.json'), '{\n  "extends": ["stylelint-plugin-rhythmguard/configs/recommended"]\n}\n');
  const again = spawnSync(process.execPath, [cliPath, 'init'], { cwd: dir, encoding: 'utf8', input: 'n\n' });
  assert.match(again.stdout, /Changes to \.stylelintrc\.json:/);
  assert.match(again.stdout, /\+\s+"scaleSources": \[/);
  assert.match(again.stdout, /Aborted/);
});

test('the audit footer repeats the run\'s scale flags and proposes --plan, not stylelint --fix', () => {
  const dir = fixture(STACKS.DTCG);
  const run = spawnSync(process.execPath, [cliPath, 'audit', '.', '--scale', 'auto', '--token-source', './tokens/tokens.json'], { cwd: dir, encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr);
  assert.match(run.stdout, /npx rhythmguard audit \. --scale auto --token-source \.\/tokens\/tokens\.json --plan/);
  assert.match(run.stdout, /npx rhythmguard audit \. --scale auto --token-source \.\/tokens\/tokens\.json --format markdown/);
  assert.match(run.stdout, /npx rhythmguard fix \. --value <px> --to <step or token>/);
  assert.doesNotMatch(run.stdout, /stylelint --fix/);
});
