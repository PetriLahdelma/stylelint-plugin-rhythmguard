'use strict';

const fs = require('node:fs');
const path = require('node:path');

const args = process.argv.slice(3);
const jsonMode = args.includes('--json');
const dir = args.find((a) => !a.startsWith('-'));

if (!dir) {
  process.stderr.write('Usage: rhythmguard audit <dir> [--json]\n');
  process.exit(1);
}

const resolvedDir = path.resolve(dir);

if (!fs.existsSync(resolvedDir)) {
  process.stderr.write(`Directory not found: ${dir}\n`);
  process.exit(1);
}

const GLOB_PATTERN = `${resolvedDir}/**/*.{css,module.css}`;

const pluginPath = path.resolve(__dirname, '..', 'index.js');

async function run() {
  const { default: stylelint } = await import('stylelint');

  let result;
  try {
    result = await stylelint.lint({
      files: GLOB_PATTERN,
      config: {
        plugins: [pluginPath],
        rules: {
          'rhythmguard/use-scale': [true, { severity: 'warning' }],
          'rhythmguard/prefer-token': [
            true,
            {
              tokenMapFromCssCustomProperties: true,
              severity: 'warning',
            },
          ],
        },
      },
    });
  } catch (err) {
    process.stderr.write(`Lint error: ${err.message}\n`);
    process.exit(1);
  }

  const fileResults = result.results || [];
  const totalFiles = fileResults.length;

  const offScaleValues = {};
  const tokenOpportunities = {};
  let filesWithIssues = 0;
  let totalWarnings = 0;

  for (const fileResult of fileResults) {
    const warnings = fileResult.warnings || [];
    if (warnings.length > 0) {
      filesWithIssues++;
    }

    for (const warning of warnings) {
      totalWarnings++;
      const text = warning.text || '';

      // Extract off-scale values from use-scale messages
      // Format: Unexpected off-scale value "13px". Use scale values (nearest: 12px or 16px).
      const offScaleMatch = text.match(
        /Unexpected off-scale value "([^"]+)"/,
      );
      if (offScaleMatch) {
        const value = offScaleMatch[1];
        offScaleValues[value] = (offScaleValues[value] || 0) + 1;
      }

      // Extract token opportunities from prefer-token messages
      // Format: Unexpected raw scale value "16px". Use design tokens for scale decisions.
      const tokenMatch = text.match(
        /Unexpected raw scale value "([^"]+)"/,
      );
      if (tokenMatch) {
        const value = tokenMatch[1];
        tokenOpportunities[value] = (tokenOpportunities[value] || 0) + 1;
      }
    }
  }

  const sortedOffScale = Object.entries(offScaleValues)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);

  const sortedTokenOps = Object.entries(tokenOpportunities)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);

  if (jsonMode) {
    const output = {
      directory: dir,
      totalFiles,
      filesWithIssues,
      totalWarnings,
      offScaleValues: Object.fromEntries(sortedOffScale),
      tokenOpportunities: Object.fromEntries(sortedTokenOps),
    };
    process.stdout.write(JSON.stringify(output, null, 2) + '\n');
    return;
  }

  // Human-readable output
  const pct = totalFiles > 0
    ? Math.round((filesWithIssues / totalFiles) * 100)
    : 0;

  const lines = [
    '',
    `Rhythmguard Audit: ${dir}`,
    '',
    `Files scanned:     ${totalFiles}`,
    `Files with issues: ${filesWithIssues} (${pct}%)`,
    '',
  ];

  if (sortedOffScale.length > 0) {
    const offScaleTotal = Object.values(offScaleValues).reduce(
      (a, b) => a + b,
      0,
    );
    lines.push(`Off-scale values: ${offScaleTotal}`);
    for (const [value, count] of sortedOffScale) {
      lines.push(`  ${value.padEnd(10)} ×${count}`);
    }
    lines.push('');
  }

  if (sortedTokenOps.length > 0) {
    const tokenTotal = Object.values(tokenOpportunities).reduce(
      (a, b) => a + b,
      0,
    );
    lines.push(`Token opportunities: ${tokenTotal}`);
    for (const [value, count] of sortedTokenOps) {
      lines.push(`  ${value.padEnd(10)} ×${count}`);
    }
    lines.push('');
  }

  if (totalWarnings === 0) {
    lines.push('No issues found. Your spacing is on scale.');
  } else {
    lines.push('Run "npx stylelint --fix" to auto-correct.');
  }

  lines.push('');
  process.stdout.write(lines.join('\n'));
}

run();
