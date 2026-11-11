'use strict';

/**
 * `npx rhythmguard` with no arguments.
 *
 * The first minute, with nothing to configure: detect the stack and any token
 * files, infer the spacing scale from the project's own tokens, audit the
 * current directory, and end with the exact config to paste. Never fails the
 * process on findings; this is a report, not a gate.
 */

const path = require('node:path');

const { auditCommand, eslintInstallLine, lintGlob, stylelintInstallLine } = require('../audit/next-steps');
const { detect } = require('./init');
const { discoverTokenPackages } = require('../core/scale-inference');
const {
  RC_FILE,
  findTokenFiles,
  inferFirstRun,
  rcFor,
  stylelintConfigFor,
  tailwindMajor,
  toPosix,
} = require('./first-run');

const HELP = `Usage: rhythmguard [quickstart]

Zero-config first run. Detects the stack and token files, infers the spacing
scale, audits the current directory, prints a config to paste and the audit
commands that reproduce its result. Never fails on findings; this is a report.

Options:
  --help        Show this help message
`;

const MAX_LISTED = 5;

function topEntries(counts, limit = MAX_LISTED) {
  return Object.entries(counts || {})
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit);
}

/** The config to paste; kept under its 3.x name for callers of this module. */
function suggestedStylelintConfig({ fallbackScale = null, nextjs = false, profile, scss = false, tokenFiles }) {
  const scale = Array.isArray(fallbackScale)
    ? { files: [], source: 'fallback', values: fallbackScale }
    : { files: tokenFiles, source: 'token-sources', values: [] };
  return stylelintConfigFor({ nextjs, profile, scale, scss, tokenFiles });
}

/**
 * The eslint.config.js block. It imports the package the printed install line
 * installs. With TypeScript files it lints .ts and .tsx through typescript-eslint's
 * parser: the default parser reads no TSX, so a JS-only block linted nothing (dx-04).
 */
// Written this way so the snippet's import lines are not read as imports of this file.
const quoted = (name) => `'${name}'`;

function eslintSnippet(scaleValues, { typescript = false } = {}) {
  // No project scale: the rule's default, Tailwind's ladder, which the audit
  // also checked class strings against (cs-05).
  const options = Array.isArray(scaleValues)
    ? `, { scale: [${scaleValues.filter((value) => typeof value === 'number').join(', ')}] }`
    : '';
  return [
    "// eslint.config.js",
    `import rhythmguard from ${quoted('eslint-plugin-rhythmguard')};`,
    ...(typescript ? [`import tseslint from ${quoted('typescript-eslint')};`] : []),
    '',
    'export default [',
    '  {',
    // Without `files` and JSX parsing, a flat config lints no .jsx at all (#243).
    typescript ? "    files: ['**/*.{js,jsx,mjs,cjs,ts,tsx}']," : "    files: ['**/*.{js,jsx,mjs,cjs}'],",
    typescript
      ? '    languageOptions: { parser: tseslint.parser, parserOptions: { ecmaFeatures: { jsx: true } } },'
      : '    languageOptions: { parserOptions: { ecmaFeatures: { jsx: true } } },',
    "    plugins: { 'rhythmguard-tailwind': rhythmguard },",
    `    rules: { 'rhythmguard-tailwind/tailwind-class-use-scale': ['warn'${options}] },`,
    '  },',
    '];',
  ].join('\n');
}

/**
 * The commands to run next. The audit commands pass what quickstart passed,
 * `--scale auto` and the token files it read, so they report the same scale
 * and the same findings; `audit .` alone would use the default scale (#287).
 */
function nextCommands(tokenSources, { eslint = false, glob = '**/*.css', stylelint = true, tailwindConfig = null } = {}) {
  const audit = auditCommand({ dir: '.', scale: 'auto', tailwindConfig: tailwindConfig ? toPosix(tailwindConfig) : null, tokenSources: tokenSources.map(toPosix) });
  // Each note on its own line above its command, so a long command copies whole.
  return [
    ...(stylelint ? [['Lint stylesheets with the config above:', `npx stylelint "${glob}"`]] : []),
    ...(eslint ? [['Lint class strings with the ESLint config above:', 'npx eslint .']] : []),
    // Snapping a value can move layout: decide per value, then rewrite (dx-11).
    ['Propose one decision per off-scale value, before changing any:', `${audit} --plan`],
    ['PR-ready report:', `${audit} --format markdown`],
    ['Then gate only new drift in CI, with the same flags:', `${audit} --write-baseline`],
    ['Check the setup:', 'npx rhythmguard doctor'],
  ].flatMap(([note, command]) => [note, `  ${command}`]);
}

function describeScale(scale) {
  if (!scale) {
    return 'default';
  }
  const files = scale.files && scale.files.length > 0 ? ` (${scale.files.slice(0, 3).join(', ')}${scale.files.length > 3 ? ', …' : ''})` : '';
  return `${scale.source}${files}`;
}

async function run() {
  // `rhythmguard` alone has no arguments; `rhythmguard quickstart` may have --help (#286).
  for (const arg of process.argv[2] === 'quickstart' ? process.argv.slice(3) : []) {
    if (arg === '--help' || arg === '-h') {
      process.stdout.write(HELP);
      return;
    }
    process.stderr.write(`Unknown option: ${arg}\n\n${HELP}`);
    process.exitCode = 1;
    return;
  }

  const cwd = process.cwd();
  const stack = detect();
  const out = [];
  let inferred;
  try {
    inferred = await inferFirstRun({ cwd, stack });
  } catch (error) {
    process.stderr.write(`Quickstart could not audit ${cwd}: ${error.message}\n`);
    process.exitCode = 1;
    return;
  }
  const { auditTokenSources, rcPresent, report, tailwindConfig, tokenFiles, twMajor } = inferred;

  out.push('', '  Rhythmguard quickstart', `  ${cwd}`, '');
  out.push('  Detected');
  out.push(`    Tailwind        ${stack.tailwind ? `v${twMajor || '?'}` : 'no'}`);
  out.push(`    Next.js         ${stack.nextjs ? 'yes' : 'no'}`);
  out.push(`    Stylelint config ${stack.hasExistingConfig ? 'present' : 'none'}`);
  out.push(`    Token files     ${tokenFiles.length > 0 ? tokenFiles.join(', ') : 'none found'}`);
  const tokenPackages = [...new Set(discoverTokenPackages(cwd).map((source) => source.package))];
  out.push(`    Token packages  ${tokenPackages.length > 0 ? tokenPackages.join(', ') : 'none installed'}`);
  out.push(`    .rhythmguardrc  ${rcPresent ? 'present (its token sources are used)' : 'none'}`);
  if (tailwindConfig) {
    out.push(`    Tailwind config ${tailwindConfig} (not loaded here: loading it runs it; the config below reads it)`);
  }
  out.push('');

  const scanned = report.scanned || {};
  const skippedStylesheets = (scanned.scssSkipped || 0) + (scanned.stylelintIgnored || 0) + (scanned.nonAuthoredSkipped || 0) + (scanned.stylelintMissing || 0);
  // An ESLint-only project: class strings were audited, stylesheets were not.
  const withoutStylelint = (scanned.stylelintMissing || 0) > 0;
  if (report.cssFilesScanned === 0 && report.templateFilesScanned === 0 && skippedStylesheets === 0) {
    out.push('  No CSS files found here. Run from your project root, or audit a directory directly:');
    out.push('    npx rhythmguard audit <directory>', '');
    process.stdout.write(`${out.join('\n')}\n`);
    return;
  }

  const scale = report.scale;
  out.push('  Scale');
  out.push(`    Scale           ${scale.values.join(', ')}`);
  out.push(`    Source          ${describeScale(scale)}`);
  if (scale.source === 'fallback' && scale.rejected) {
    out.push(`    Note            Spacing tokens were found but do not form a scale (${scale.rejected.reasons.join(', ')}); the audit's default scale is being used.`);
    out.push('                    Point scaleSources at your real token file, or tighten tokenPattern.');
  } else if (scale.source === 'fallback' && tailwindConfig) {
    out.push(`    Note            No spacing tokens found; the default scale is shown. The config below reads ${tailwindConfig};`);
    out.push(`                    audit with it: npx rhythmguard audit . --scale auto --tailwind-config ${toPosix(tailwindConfig)}`);
  } else if (scale.source === 'fallback') {
    out.push("    Note            No spacing tokens found; the audit's default scale is being used.");
    out.push('                    Add scaleSources or define --space-*/--spacing-* custom properties to lint against your own scale.');
  }
  // Every loader warning, so a token file that was found but not read says why (tf-12).
  for (const warning of new Set(report.tokenSourceWarnings || [])) {
    out.push(`    !               ${warning}`);
  }
  if (scale.classStrings) {
    out.push(`    Class strings   ${scale.classStrings.name} (the ESLint rule's default)`);
  }
  out.push('');

  const offScale = report.findings.css.filter((finding) => finding.type === 'off-scale');
  out.push('  Findings');
  out.push(`    CSS files       ${report.cssFilesScanned}`);
  out.push(`    Template files  ${report.templateFilesScanned}`);
  if (skippedStylesheets > 0) {
    const reasons = [
      ...(withoutStylelint ? [`${scanned.stylelintMissing} because Stylelint is not installed`] : []),
      ...(scanned.scssSkipped > 0 ? [`${scanned.scssSkipped} SCSS without postcss-scss`] : []),
      ...(scanned.stylelintIgnored > 0 ? [`${scanned.stylelintIgnored} in .stylelintignore`] : []),
      ...(scanned.nonAuthoredSkipped > 0 ? [`${scanned.nonAuthoredSkipped} vendored, minified or built`] : []),
    ];
    out.push(`    Skipped         ${skippedStylesheets} not audited (${reasons.join(', ')})`);
  }
  const parseErrors = (report.findings.parseErrors || []).length;
  if (parseErrors > 0) {
    out.push(`    Parse errors    ${parseErrors} not audited (the stylesheet could not be parsed)`);
  }
  out.push(`    Off-scale       ${offScale.length} in CSS, ${report.findings.tailwind.length} in class strings`);
  out.push(`    Token opps      ${report.findings.css.length - offScale.length} raw values that match or deserve a token`);
  out.push(`    Cleanliness     ${report.scaleCleanliness}%`);
  const topValues = topEntries(report.offScaleValues);
  if (topValues.length > 0) {
    out.push(`    Top values      ${topValues.map(([value, count]) => `${value} ×${count}`).join(', ')}`);
  }
  const topProperties = topEntries(report.offScaleProperties);
  if (topProperties.length > 0) {
    out.push(`    Top properties  ${topProperties.map(([property, count]) => `${property} ×${count}`).join(', ')}`);
  }
  const topFiles = (report.topAffectedFiles || []).slice(0, 3);
  if (topFiles.length > 0) {
    out.push(`    Top files       ${topFiles.map((entry) => `${entry.file} (${entry.count})`).join(', ')}`);
  }
  out.push('');

  const profile = stack.tailwind ? 'tailwind' : 'recommended';
  const files = report.files || { cssFiles: [], templateFiles: [] };
  const scss = files.cssFiles.some((file) => file.endsWith('.scss'));
  const templateExtensions = new Set(files.templateFiles.map((file) => path.extname(file)));
  const typescript = templateExtensions.has('.ts') || templateExtensions.has('.tsx');
  const otherTemplates = ['.vue', '.svelte', '.astro'].filter((extension) => templateExtensions.has(extension));
  const glob = lintGlob(cwd, files.cssFiles);
  const printStylelint = () => {
    out.push(withoutStylelint ? '  To audit your stylesheets too, install Stylelint and the plugin:' : '  Install:', '');
    out.push(`    ${stylelintInstallLine({ scss, tailwindConfig: profile === 'tailwind' })}`, '');
    out.push(`  ${withoutStylelint ? 'then paste' : 'Then paste'} this into .stylelintrc.json${stack.hasExistingConfig ? ' (merge with your existing config)' : ''}:`, '');
    out.push(JSON.stringify(stylelintConfigFor({ nextjs: stack.nextjs, profile, scale, scss, tailwindConfig, tokenFiles }), null, 2).replace(/^/gm, '    '));
    out.push('');
    if (!rcPresent) {
      // So a bare `npx rhythmguard audit .`, CI and an agent use this scale too (ai-01).
      out.push(`  And this into ${RC_FILE}, so \`npx rhythmguard audit .\` uses the same scale:`, '');
      out.push(JSON.stringify(rcFor({ tailwindConfig, tokenFiles }), null, 2).replace(/^/gm, '    '));
      out.push('');
    }
  };
  const printEslint = () => {
    out.push('  Tailwind class strings need the ESLint companion. Install:', '');
    out.push(`    ${eslintInstallLine({ typescript })}`, '');
    out.push('  Then paste this into eslint.config.js:', '');
    out.push(eslintSnippet(scale.classStrings ? null : scale.values, { typescript }).replace(/^/gm, '    '));
    if (otherTemplates.length > 0) {
      out.push('', `    ${otherTemplates.join(', ')} files need their parser in a block of their own; see the`);
      out.push('    eslint-plugin-rhythmguard README, "Other file types".');
    }
    out.push('');
  };

  // Without Stylelint the class strings are what was audited, so their config comes first.
  if (stack.tailwind && withoutStylelint) {
    printEslint();
    printStylelint();
  } else {
    printStylelint();
    if (stack.tailwind) {
      printEslint();
    }
  }

  out.push('  Next');
  out.push(...nextCommands(auditTokenSources, { eslint: stack.tailwind, glob, stylelint: !withoutStylelint, tailwindConfig }).map((line) => `    ${line}`));
  out.push('');

  process.stdout.write(`${out.join('\n')}\n`);
}

module.exports = { HELP, eslintSnippet, findTokenFiles, nextCommands, run, suggestedStylelintConfig, tailwindMajor };
