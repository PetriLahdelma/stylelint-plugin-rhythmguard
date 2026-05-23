'use strict';

const fs = require('node:fs');
const path = require('node:path');

const { formatLength } = require('../utils/length');
const { createTailwindClassAnalyzer } = require('../utils/tailwind-class-analysis');

const args = process.argv.slice(3);
const pluginPath = path.resolve(__dirname, '..', 'index.js');

const DEFAULT_SCALE = [0, 4, 8, 12, 16, 24, 32];
const DEFAULT_BASE_FONT_SIZE = 16;
const VALID_FORMATS = new Set(['text', 'json', 'markdown']);
const SKIP_DIRS = new Set([
  '.git',
  '.next',
  '.nuxt',
  '.omx',
  '.svelte-kit',
  '.turbo',
  '.vercel',
  'build',
  'coverage',
  'dist',
  'node_modules',
  'out',
]);
const TEMPLATE_EXTENSIONS = new Set([
  '.astro',
  '.cjs',
  '.js',
  '.jsx',
  '.mjs',
  '.svelte',
  '.ts',
  '.tsx',
  '.vue',
]);

const HELP = `Usage: rhythmguard audit <dir> [options]

Options:
  --format <text|json|markdown>  Output format (default: text)
  --json                         Alias for --format json
  --markdown                     Alias for --format markdown
  --ignore <pattern>             Exclude root-relative path/glob (repeatable, comma-separated)
  --scale <values>               Comma-separated scale values (default: 0,4,8,12,16,24,32)
  --base-font-size <number>      px base for rem/em conversion (default: 16)
`;

function parseArgs(argv) {
  const parsed = {
    baseFontSize: DEFAULT_BASE_FONT_SIZE,
    dir: null,
    format: 'text',
    ignorePatterns: [],
    scale: DEFAULT_SCALE,
  };

  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];

    if (arg === '--help' || arg === '-h') {
      parsed.help = true;
      continue;
    }

    if (arg === '--json') {
      parsed.format = 'json';
      continue;
    }

    if (arg === '--markdown') {
      parsed.format = 'markdown';
      continue;
    }

    if (arg === '--ignore') {
      parsed.ignorePatterns.push(...parseIgnorePatterns(argv[++index]));
      continue;
    }

    if (arg.startsWith('--ignore=')) {
      parsed.ignorePatterns.push(...parseIgnorePatterns(arg.slice('--ignore='.length)));
      continue;
    }

    if (arg === '--format') {
      parsed.format = String(argv[++index] || '').toLowerCase();
      continue;
    }

    if (arg.startsWith('--format=')) {
      parsed.format = arg.slice('--format='.length).toLowerCase();
      continue;
    }

    if (arg === '--scale') {
      parsed.scale = parseScale(argv[++index]);
      continue;
    }

    if (arg.startsWith('--scale=')) {
      parsed.scale = parseScale(arg.slice('--scale='.length));
      continue;
    }

    if (arg === '--base-font-size') {
      parsed.baseFontSize = parseBaseFontSize(argv[++index]);
      continue;
    }

    if (arg.startsWith('--base-font-size=')) {
      parsed.baseFontSize = parseBaseFontSize(arg.slice('--base-font-size='.length));
      continue;
    }

    if (!arg.startsWith('-') && !parsed.dir) {
      parsed.dir = arg;
      continue;
    }

    throw new Error(`Unknown option: ${arg}`);
  }

  if (!VALID_FORMATS.has(parsed.format)) {
    throw new Error(`Invalid format "${parsed.format}". Expected text, json, or markdown.`);
  }

  return parsed;
}

function parseIgnorePatterns(raw) {
  if (!raw) {
    throw new Error('Missing value for --ignore.');
  }

  const patterns = String(raw).split(',')
    .map((pattern) => normalizeIgnorePattern(pattern))
    .filter(Boolean);

  if (patterns.length === 0) {
    throw new Error('--ignore must include at least one pattern.');
  }

  return patterns;
}

function normalizeIgnorePattern(pattern) {
  return String(pattern)
    .trim()
    .replace(/\\/g, '/')
    .replace(/^\/+/, '')
    .replace(/^\.\//, '')
    .replace(/\/+$/, '');
}

function parseScale(raw) {
  if (!raw) {
    throw new Error('Missing value for --scale.');
  }

  const scale = raw.split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const numeric = Number(part);
      return Number.isFinite(numeric) && !/[a-z%]/i.test(part) ? numeric : part;
    });

  if (scale.length === 0) {
    throw new Error('Scale must include at least one value.');
  }

  return scale;
}

function parseBaseFontSize(raw) {
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error('--base-font-size must be a positive number.');
  }

  return value;
}

function assertDirectory(dir) {
  if (!dir) {
    process.stderr.write(HELP);
    process.exit(1);
  }

  const resolvedDir = path.resolve(dir);
  if (!fs.existsSync(resolvedDir)) {
    process.stderr.write(`Directory not found: ${dir}\n`);
    process.exit(1);
  }

  if (!fs.statSync(resolvedDir).isDirectory()) {
    process.stderr.write(`Not a directory: ${dir}\n`);
    process.exit(1);
  }

  return resolvedDir;
}

function walkFiles(rootDir, ignorePatterns = []) {
  const cssFiles = [];
  const templateFiles = [];
  const ignoreMatchers = createIgnoreMatchers(ignorePatterns);

  function walk(currentDir) {
    for (const entry of fs.readdirSync(currentDir, { withFileTypes: true })) {
      const fullPath = path.join(currentDir, entry.name);
      const relativePath = toPosixRelativePath(rootDir, fullPath);

      if (shouldIgnorePath(relativePath, entry, ignoreMatchers)) {
        continue;
      }

      if (entry.isDirectory()) {
        walk(fullPath);
        continue;
      }

      if (entry.isFile()) {
        if (isCssFile(fullPath)) {
          cssFiles.push(fullPath);
        } else if (isTemplateFile(fullPath)) {
          templateFiles.push(fullPath);
        }
      }
    }
  }

  walk(rootDir);
  return { cssFiles, templateFiles };
}

function shouldIgnorePath(relativePath, entry, ignoreMatchers) {
  return ignoreMatchers.some((matcher) => matcher.test(relativePath))
    || (entry.isDirectory() && SKIP_DIRS.has(entry.name));
}

function createIgnoreMatchers(patterns) {
  const variants = new Set();

  for (const pattern of patterns) {
    addIgnorePatternVariants(variants, pattern);
  }

  return Array.from(variants, (pattern) => globToRegExp(pattern));
}

function addIgnorePatternVariants(variants, pattern) {
  if (!pattern) {
    return;
  }

  variants.add(pattern);

  if (!pattern.includes('/')) {
    variants.add(`${pattern}/**`);
    variants.add(`**/${pattern}`);
    variants.add(`**/${pattern}/**`);
    return;
  }

  if (pattern.endsWith('/**')) {
    variants.add(pattern.slice(0, -3));
    return;
  }

  if (!hasGlob(pattern)) {
    variants.add(`${pattern}/**`);
  }
}

function hasGlob(pattern) {
  return /[*?]/.test(pattern);
}

function globToRegExp(pattern) {
  let source = '^';

  for (let index = 0; index < pattern.length; index++) {
    const char = pattern[index];
    const nextChar = pattern[index + 1];

    if (char === '*' && nextChar === '*') {
      source += '.*';
      index++;
      continue;
    }

    if (char === '*') {
      source += '[^/]*';
      continue;
    }

    if (char === '?') {
      source += '[^/]';
      continue;
    }

    source += escapeRegExp(char);
  }

  return new RegExp(`${source}$`);
}

function escapeRegExp(value) {
  return value.replace(/[|\\{}()[\]^$+*?.]/g, '\\$&');
}

function toPosixRelativePath(rootDir, filePath) {
  return path.relative(rootDir, filePath).split(path.sep).join('/');
}

function isCssFile(filePath) {
  return filePath.endsWith('.css');
}

function isTemplateFile(filePath) {
  return TEMPLATE_EXTENSIONS.has(path.extname(filePath));
}

async function runStylelintAudit(cssFiles, options) {
  if (cssFiles.length === 0) {
    return [];
  }

  const { default: stylelint } = await import('stylelint');

  const result = await stylelint.lint({
    files: cssFiles,
    config: {
      plugins: [pluginPath],
      rules: {
        'rhythmguard/use-scale': [
          true,
          {
            baseFontSize: options.baseFontSize,
            scale: options.scale,
            severity: 'warning',
          },
        ],
        'rhythmguard/prefer-token': [
          true,
          {
            baseFontSize: options.baseFontSize,
            scale: options.scale,
            severity: 'warning',
            tokenMapFromCssCustomProperties: true,
            tokenPattern: '^--spac(e|ing)-',
          },
        ],
      },
    },
  });

  return result.results || [];
}

function collectCssFindings(fileResults) {
  const findings = [];

  for (const fileResult of fileResults) {
    for (const warning of fileResult.warnings || []) {
      const text = warning.text || '';
      const offScaleMatch = text.match(
        /Unexpected (?:off-scale value|transform translation value) "([^"]+)"/,
      );
      const tokenMatch = text.match(
        /Unexpected raw scale value "([^"]+)"/,
      );

      findings.push({
        column: warning.column || 1,
        file: formatPath(fileResult.source),
        line: warning.line || 1,
        rule: warning.rule || 'rhythmguard',
        text,
        type: tokenMatch ? 'token-opportunity' : 'off-scale',
        value: tokenMatch ? tokenMatch[1] : offScaleMatch ? offScaleMatch[1] : null,
      });
    }
  }

  return findings;
}

function collectTailwindFindings(templateFiles, options) {
  const analyzer = createTailwindClassAnalyzer(options);
  const findings = [];

  for (const filePath of templateFiles) {
    let source = '';
    try {
      source = fs.readFileSync(filePath, 'utf8');
    } catch {
      continue;
    }

    const lineStarts = getLineStarts(source);

    for (const literal of findStringLiterals(source)) {
      for (const { analysis, segment } of analyzer.analyzeClassString(literal.value)) {
        const position = offsetToLineColumn(lineStarts, literal.valueStart + segment.start);
        findings.push({
          column: position.column,
          file: formatPath(filePath),
          fixedToken: analysis.fixedToken,
          line: position.line,
          nearest: analysis.nearest
            ? {
              lower: formatLength(analysis.nearest.lower, 'px'),
              upper: formatLength(analysis.nearest.upper, 'px'),
            }
            : null,
          rawValue: analysis.rawValue,
          rule: 'rhythmguard-tailwind/tailwind-class-use-scale',
          text: analysis.reason === 'negative'
            ? `Unexpected Tailwind arbitrary spacing value "${segment.token}". Negative values are disabled for this rule.`
            : `Unexpected Tailwind arbitrary spacing value "${segment.token}". Use scale values.`,
          token: segment.token,
          type: 'tailwind-arbitrary-spacing',
          utility: analysis.utility,
        });
      }
    }
  }

  return findings;
}

function findStringLiterals(source) {
  const literals = [];
  const literalPattern = /(["'`])((?:\\[\s\S]|(?!\1)[\s\S])*?)\1/g;
  let match;

  while ((match = literalPattern.exec(source)) !== null) {
    literals.push({
      quote: match[1],
      value: match[2],
      valueStart: match.index + 1,
    });
  }

  return literals;
}

function getLineStarts(source) {
  const starts = [0];

  for (let index = 0; index < source.length; index++) {
    if (source[index] === '\n') {
      starts.push(index + 1);
    }
  }

  return starts;
}

function offsetToLineColumn(lineStarts, offset) {
  let low = 0;
  let high = lineStarts.length - 1;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    if (lineStarts[mid] <= offset) {
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  const lineIndex = Math.max(0, high);
  return {
    column: offset - lineStarts[lineIndex] + 1,
    line: lineIndex + 1,
  };
}

function buildReport({
  cssFiles,
  cssFindings,
  dir,
  templateFiles,
  tailwindFindings,
}) {
  const offScaleValues = countByValue(cssFindings
    .filter((finding) => finding.type === 'off-scale' && finding.value)
    .map((finding) => finding.value));
  const tokenOpportunities = countByValue(cssFindings
    .filter((finding) => finding.type === 'token-opportunity' && finding.value)
    .map((finding) => finding.value));
  const tailwindArbitraryValues = countByValue(tailwindFindings
    .map((finding) => finding.rawValue));
  const issueFiles = new Set([
    ...cssFindings.map((finding) => finding.file),
    ...tailwindFindings.map((finding) => finding.file),
  ]);
  const topAffectedFiles = sortCountMap(countByValue([
    ...cssFindings.map((finding) => finding.file),
    ...tailwindFindings.map((finding) => finding.file),
  ])).slice(0, 10);

  const totalFiles = cssFiles.length + templateFiles.length;
  const totalWarnings = cssFindings.length + tailwindFindings.length;
  const filesWithIssues = issueFiles.size;
  const scaleCleanliness = totalFiles > 0
    ? Math.max(0, Math.round(((totalFiles - filesWithIssues) / totalFiles) * 100))
    : 100;

  return {
    cssFilesScanned: cssFiles.length,
    directory: dir,
    filesWithIssues,
    findings: {
      css: cssFindings,
      tailwind: tailwindFindings,
    },
    formatVersion: 2,
    offScaleValues: Object.fromEntries(sortCountMap(offScaleValues).slice(0, 10)),
    scaleCleanliness,
    scanned: {
      cssFiles: cssFiles.length,
      templateFiles: templateFiles.length,
      totalFiles,
    },
    summary: {
      cssWarnings: cssFindings.length,
      filesWithIssues,
      scaleCleanliness,
      tailwindArbitrarySpacing: tailwindFindings.length,
      tokenOpportunities: sumCounts(tokenOpportunities),
      totalFindings: totalWarnings,
    },
    tailwindArbitraryValues: Object.fromEntries(sortCountMap(tailwindArbitraryValues).slice(0, 10)),
    templateFilesScanned: templateFiles.length,
    tokenOpportunities: Object.fromEntries(sortCountMap(tokenOpportunities).slice(0, 10)),
    topAffectedFiles: topAffectedFiles.map(([file, count]) => ({ count, file })),
    totalFiles,
    totalWarnings,
  };
}

function countByValue(values) {
  const counts = {};

  for (const value of values) {
    if (value) {
      counts[value] = (counts[value] || 0) + 1;
    }
  }

  return counts;
}

function sortCountMap(counts) {
  return Object.entries(counts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

function sumCounts(counts) {
  return Object.values(counts).reduce((total, count) => total + count, 0);
}

function renderText(report) {
  const lines = [
    '',
    '  ┌─ RHYTHMGUARD DESIGN-SYSTEM AUDIT ─────────────────────────┐',
    `  │  ${report.directory.padEnd(58)}│`,
    '  └─────────────────────────────────────────────────────────────┘',
    '',
    `  CSS files scanned        ${String(report.cssFilesScanned).padStart(4)}`,
    `  Template files scanned   ${String(report.templateFilesScanned).padStart(4)}`,
    `  Files with issues        ${String(report.filesWithIssues).padStart(4)}`,
    `  Scale cleanliness        ${scoreBar(report.scaleCleanliness)}  ${report.scaleCleanliness}%`,
    '',
  ];

  appendHistogram(lines, 'CSS OFF-SCALE VALUES', report.offScaleValues);
  appendHistogram(lines, 'CSS TOKEN OPPORTUNITIES', report.tokenOpportunities);
  appendHistogram(lines, 'TAILWIND CLASS-STRING DRIFT', report.tailwindArbitraryValues);

  if (report.topAffectedFiles.length > 0) {
    lines.push('  ── TOP AFFECTED FILES ──');
    lines.push('');
    const maxCount = Math.max(...report.topAffectedFiles.map(({ count }) => count));
    for (const { file, count } of report.topAffectedFiles) {
      lines.push(`  ${truncate(file, 34).padEnd(36)} ${histBar(count, maxCount)} ${count}`);
    }
    lines.push('');
  }

  if (report.totalWarnings === 0) {
    lines.push('  ✓ No issues found. Your design-system rhythm is clean.');
  } else {
    lines.push('  → Run "npx stylelint --fix" for CSS declaration fixes.');
    lines.push('  → Use "npx rhythmguard audit ./src --format markdown" for PR/design review.');
  }
  lines.push('');

  return `${lines.join('\n')}\n`;
}

function appendHistogram(lines, title, counts) {
  const entries = sortCountMap(counts);
  const total = sumCounts(counts);

  if (entries.length === 0) {
    return;
  }

  lines.push(`  ── ${title} ──  ${total} total`);
  lines.push('');
  const maxCount = Math.max(...entries.map(([, count]) => count));
  for (const [value, count] of entries) {
    lines.push(`  ${value.padEnd(14)} ${histBar(count, maxCount)} ${count}`);
  }
  lines.push('');
}

function renderMarkdown(report) {
  const lines = [
    '# Rhythmguard Design-System Audit',
    '',
    `Directory: \`${report.directory}\``,
    '',
    '## Summary',
    '',
    '| Metric | Value |',
    '| --- | ---: |',
    `| CSS files scanned | ${report.cssFilesScanned} |`,
    `| Template files scanned | ${report.templateFilesScanned} |`,
    `| Files with issues | ${report.filesWithIssues} |`,
    `| Total findings | ${report.totalWarnings} |`,
    `| Scale cleanliness | ${report.scaleCleanliness}% |`,
    '',
  ];

  appendMarkdownCounts(lines, 'CSS Off-Scale Values', report.offScaleValues);
  appendMarkdownCounts(lines, 'CSS Token Opportunities', report.tokenOpportunities);
  appendMarkdownCounts(lines, 'Tailwind Class-String Drift', report.tailwindArbitraryValues);

  if (report.topAffectedFiles.length > 0) {
    lines.push('## Top Affected Files');
    lines.push('');
    lines.push('| File | Findings |');
    lines.push('| --- | ---: |');
    for (const { file, count } of report.topAffectedFiles) {
      lines.push(`| \`${escapeMarkdown(file)}\` | ${count} |`);
    }
    lines.push('');
  }

  if (report.findings.tailwind.length > 0) {
    lines.push('## Tailwind Examples');
    lines.push('');
    lines.push('| File | Class | Suggested class |');
    lines.push('| --- | --- | --- |');
    for (const finding of report.findings.tailwind.slice(0, 10)) {
      lines.push(`| \`${escapeMarkdown(`${finding.file}:${finding.line}`)}\` | \`${escapeMarkdown(finding.token)}\` | \`${escapeMarkdown(finding.fixedToken || 'n/a')}\` |`);
    }
    lines.push('');
  }

  lines.push('## Recommended Next Actions');
  lines.push('');
  if (report.totalWarnings === 0) {
    lines.push('- Keep Rhythmguard in CI to prevent new drift.');
  } else {
    lines.push('- Run deterministic autofix for CSS declarations where appropriate.');
    lines.push('- Review Tailwind arbitrary spacing values with UX/design-system owners.');
    lines.push('- Convert repeated raw on-scale values into existing design tokens.');
  }
  lines.push('');

  return `${lines.join('\n')}\n`;
}

function appendMarkdownCounts(lines, title, counts) {
  const entries = sortCountMap(counts);

  if (entries.length === 0) {
    return;
  }

  lines.push(`## ${title}`);
  lines.push('');
  lines.push('| Value | Count |');
  lines.push('| --- | ---: |');
  for (const [value, count] of entries) {
    lines.push(`| \`${escapeMarkdown(value)}\` | ${count} |`);
  }
  lines.push('');
}

function histBar(count, maxCount) {
  const width = 30;
  const filled = Math.round((count / maxCount) * width);
  return '█'.repeat(filled) + '░'.repeat(width - filled);
}

function scoreBar(pct) {
  const width = 20;
  const filled = Math.round((pct / 100) * width);
  return '█'.repeat(filled) + '░'.repeat(width - filled);
}

function truncate(value, maxLength) {
  if (value.length <= maxLength) {
    return value;
  }

  return `…${value.slice(value.length - maxLength + 1)}`;
}

function escapeMarkdown(value) {
  return String(value).replace(/\|/g, '\\|').replace(/`/g, '\\`');
}

function formatPath(filePath) {
  return path.relative(process.cwd(), filePath).replace(/\\/g, '/');
}

async function run() {
  let parsed;
  try {
    parsed = parseArgs(args);
  } catch (err) {
    process.stderr.write(`${err.message}\n\n${HELP}`);
    process.exit(1);
  }

  if (parsed.help) {
    process.stdout.write(HELP);
    return;
  }

  const resolvedDir = assertDirectory(parsed.dir);
  const { cssFiles, templateFiles } = walkFiles(resolvedDir, parsed.ignorePatterns);
  const options = {
    baseFontSize: parsed.baseFontSize,
    scale: parsed.scale,
  };

  let cssResults;
  try {
    cssResults = await runStylelintAudit(cssFiles, options);
  } catch (err) {
    process.stderr.write(`Lint error: ${err.message}\n`);
    process.exit(1);
  }

  const report = buildReport({
    cssFiles,
    cssFindings: collectCssFindings(cssResults),
    dir: parsed.dir,
    tailwindFindings: collectTailwindFindings(templateFiles, options),
    templateFiles,
  });

  if (parsed.format === 'json') {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    return;
  }

  if (parsed.format === 'markdown') {
    process.stdout.write(renderMarkdown(report));
    return;
  }

  process.stdout.write(renderText(report));
}

run();
