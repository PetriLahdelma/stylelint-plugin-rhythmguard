'use strict';

/**
 * The commands the quickstart, `init` and the audit's text footer print next,
 * built from what the run scanned rather than written as literals, so each one
 * works when pasted: the install line names every package the pasted config
 * needs, the lint glob matches the stylesheets that were found, and the audit
 * command repeats the run's own scale flags (dx-01, dx-05, dx-10, dx-11).
 */
const path = require('node:path');

const { peerDependencies } = require('../../package.json');

const SAFE_DIRECTORY = /^[\w.@+-]+$/;

function shellQuote(value) {
  return /^[\w./@%+=:,-]+$/.test(value) ? value : `'${value.replace(/'/g, "'\\''")}'`;
}

/** `npm install` for the Stylelint path: Stylelint at the plugin's peer range, plus what the pasted config extends or parses with. */
function stylelintInstallLine({ scss = false, tailwindConfig = false } = {}) {
  return [
    'npm install --save-dev',
    // Double quotes: the range holds spaces and ||, and cmd.exe does not take single quotes.
    `"stylelint@${peerDependencies.stylelint}"`,
    'stylelint-plugin-rhythmguard',
    ...(tailwindConfig ? ['stylelint-config-tailwindcss'] : []),
    ...(scss ? ['postcss-scss'] : []),
  ].join(' ');
}

/** `npm install` for the class-string path, with the TypeScript parser when the snippet uses it. */
function eslintInstallLine({ typescript = false } = {}) {
  return ['npm install --save-dev eslint eslint-plugin-rhythmguard', ...(typescript ? ['typescript-eslint'] : [])].join(' ');
}

/**
 * The Stylelint glob for the stylesheets a run found: under their one top-level
 * directory when they share it (`src/**\/*.css`), else from the root, with the
 * extensions that occur (`*.{css,scss}`).
 */
function lintGlob(cwd, cssFiles) {
  const relative = cssFiles.map((file) => path.relative(cwd, file)).filter((file) => file && !file.startsWith('..'));
  const extensions = [...new Set(relative.map((file) => path.extname(file).slice(1)).filter(Boolean))].sort();
  const pattern = extensions.length > 1 ? `*.{${extensions.join(',')}}` : `*.${extensions[0] || 'css'}`;
  const tops = new Set(relative.map((file) => (file.includes(path.sep) ? file.split(path.sep)[0] : '')));
  const top = tops.size === 1 ? [...tops][0] : '';
  // The glob is printed inside double quotes for pasting, where $(...) and
  // backticks still expand, so a directory name goes in only when it is plain.
  return top && SAFE_DIRECTORY.test(top) ? `${top}/**/${pattern}` : `**/${pattern}`;
}

/** `npx rhythmguard audit <dir>` with the scale flags of the run it describes. */
function auditCommand({ dir = '.', scale = null, tokenSources = [] } = {}) {
  const scaleArg = Array.isArray(scale) ? scale.join(',') : scale;
  return [
    'npx rhythmguard audit',
    shellQuote(dir),
    ...(scaleArg ? [`--scale ${shellQuote(String(scaleArg))}`] : []),
    ...tokenSources.map((file) => `--token-source ${shellQuote(file)}`),
  ].join(' ');
}

/**
 * The audit command a CLI run should be repeated with: only the flags the user
 * passed, since anything from .rhythmguardrc.json is read again anyway.
 */
function auditCommandFromArgs(parsed) {
  const passed = parsed.cliOptions || new Set();
  return auditCommand({
    dir: parsed.dir || '.',
    scale: passed.has('scale') ? parsed.scale : null,
    tokenSources: passed.has('tokenSources') ? parsed.tokenSources.map((entry) => (typeof entry === 'string' ? entry : entry.path)) : [],
  });
}

module.exports = {
  auditCommand,
  auditCommandFromArgs,
  eslintInstallLine,
  lintGlob,
  shellQuote,
  stylelintInstallLine,
};
