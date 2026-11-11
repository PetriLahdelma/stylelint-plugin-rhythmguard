'use strict';

/**
 * Temp-dir projects for `rhythmguard doctor`. Packages are installed by
 * linking this checkout's own copies into the project's node_modules, so the
 * doctor resolves Stylelint, ESLint and the plugins from the project as it
 * would after `npm install`, with no network.
 */
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const repoRoot = path.join(__dirname, '..', '..');
const cliPath = path.join(repoRoot, 'src', 'cli', 'index.js');
const stylelintDir = path.join(repoRoot, 'node_modules', 'stylelint');

function makeProject(files = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rhythmguard-doctor-'));
  for (const [file, content] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
    fs.writeFileSync(path.join(dir, file), content);
  }
  return dir;
}

function link(dir, name, target) {
  const linkPath = path.join(dir, 'node_modules', name);
  fs.mkdirSync(path.dirname(linkPath), { recursive: true });
  fs.symlinkSync(target, linkPath, 'dir');
}

const linkStylelint = (dir) => link(dir, 'stylelint', stylelintDir);
const linkEslint = (dir) => link(dir, 'eslint', path.join(repoRoot, 'node_modules', 'eslint'));
// The plugin is this checkout, as `npm install stylelint-plugin-rhythmguard` would place it.
const linkPlugin = (dir) => link(dir, 'stylelint-plugin-rhythmguard', repoRoot);

/**
 * eslint-plugin-rhythmguard is copied rather than linked: it requires
 * stylelint-plugin-rhythmguard by name, which must resolve from the project,
 * as it does when npm installs it as a dependency.
 */
function linkEslintPlugin(dir) {
  const target = path.join(dir, 'node_modules', 'eslint-plugin-rhythmguard');
  fs.mkdirSync(target, { recursive: true });
  for (const file of ['index.js', 'index.mjs', 'package.json']) {
    fs.copyFileSync(path.join(repoRoot, 'packages', 'eslint-plugin-rhythmguard', file), path.join(target, file));
  }
  if (!fs.existsSync(path.join(dir, 'node_modules', 'stylelint-plugin-rhythmguard'))) {
    linkPlugin(dir);
  }
}

/**
 * A Stylelint that reports `version`. Loadable: it re-exports this checkout's
 * Stylelint, so configs load and lint for real. Not loadable: a manifest only.
 */
function stylelintAtVersion(dir, version, { loadable = true } = {}) {
  const target = path.join(dir, 'node_modules', 'stylelint');
  fs.mkdirSync(target, { recursive: true });
  fs.writeFileSync(path.join(target, 'package.json'), JSON.stringify({
    exports: { '.': './index.mjs', './package.json': './package.json' },
    name: 'stylelint',
    type: 'module',
    version,
  }));
  if (loadable) {
    const real = pathToFileURL(path.join(stylelintDir, 'lib', 'index.mjs')).href;
    fs.writeFileSync(path.join(target, 'index.mjs'), `import stylelint from '${real}';\nexport default stylelint;\n`);
  }
}

function runDoctorCli(dir, args = []) {
  return spawnSync(process.execPath, [cliPath, 'doctor', ...args], { cwd: dir, encoding: 'utf8' });
}

module.exports = {
  linkEslint,
  linkEslintPlugin,
  linkPlugin,
  linkStylelint,
  makeProject,
  runDoctorCli,
  stylelintAtVersion,
};
