'use strict';

const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const { formatLength } = require('../utils/length');
const { createTailwindClassAnalyzer } = require('../utils/tailwind-class-analysis');

const args = process.argv.slice(3);
const pluginPath = path.resolve(__dirname, '..', 'index.js');

const DEFAULT_SCALE = [0, 4, 8, 12, 16, 24, 32];
const DEFAULT_BASE_FONT_SIZE = 16;
const DEFAULT_BASELINE_PATH = '.rhythmguard-baseline.json';
const DEFAULT_IGNORE_PATH = '.rhythmguardignore';
const DEFAULT_TOKEN_PATTERN = '^--spac(e|ing)-';
const DEFAULT_TOKEN_CANDIDATE_MIN_COUNT = 2;
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
  --ignore-path <file>           Load ignore patterns from file (default: .rhythmguardignore when present)
  --baseline <file>              Baseline file path (default: .rhythmguard-baseline.json)
  --write-baseline [file]        Write current findings as a baseline
  --since-baseline [file]        Compare current findings against a baseline
  --fail-on-new-drift            Exit 1 when --since-baseline finds new drift
  --max-findings <number>        Exit 1 when total findings exceed this count
  --min-cleanliness <percent>    Exit 1 when scale cleanliness is lower than this percent
  --since <git-ref>              Scan only changed files since a git ref
  --staged                       Scan only staged files
  --token-candidate-min-count <n> Minimum repeated raw value count for token candidates (default: 2)
  --scale <values>               Comma-separated scale values (default: 0,4,8,12,16,24,32)
  --base-font-size <number>      px base for rem/em conversion (default: 16)
`;

function parseArgs(argv) {
  const parsed = {
    baselinePath: DEFAULT_BASELINE_PATH,
    baseFontSize: DEFAULT_BASE_FONT_SIZE,
    dir: null,
    failOnNewDrift: false,
    format: 'text',
    ignorePath: DEFAULT_IGNORE_PATH,
    ignorePatterns: [],
    maxFindings: null,
    minCleanliness: null,
    scale: DEFAULT_SCALE,
    since: null,
    sinceBaseline: false,
    staged: false,
    tokenCandidateMinCount: DEFAULT_TOKEN_CANDIDATE_MIN_COUNT,
    writeBaseline: false,
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

    if (arg === '--ignore-path') {
      parsed.ignorePath = parsePathOption(argv[++index], '--ignore-path');
      continue;
    }

    if (arg.startsWith('--ignore-path=')) {
      parsed.ignorePath = parsePathOption(arg.slice('--ignore-path='.length), '--ignore-path');
      continue;
    }

    if (arg === '--baseline') {
      parsed.baselinePath = parsePathOption(argv[++index], '--baseline');
      continue;
    }

    if (arg.startsWith('--baseline=')) {
      parsed.baselinePath = parsePathOption(arg.slice('--baseline='.length), '--baseline');
      continue;
    }

    if (arg === '--write-baseline') {
      parsed.writeBaseline = true;
      if (argv[index + 1] && !argv[index + 1].startsWith('-')) {
        parsed.baselinePath = parsePathOption(argv[++index], '--write-baseline');
      }
      continue;
    }

    if (arg.startsWith('--write-baseline=')) {
      parsed.writeBaseline = true;
      parsed.baselinePath = parsePathOption(arg.slice('--write-baseline='.length), '--write-baseline');
      continue;
    }

    if (arg === '--since-baseline') {
      parsed.sinceBaseline = true;
      if (argv[index + 1] && !argv[index + 1].startsWith('-')) {
        parsed.baselinePath = parsePathOption(argv[++index], '--since-baseline');
      }
      continue;
    }

    if (arg.startsWith('--since-baseline=')) {
      parsed.sinceBaseline = true;
      parsed.baselinePath = parsePathOption(arg.slice('--since-baseline='.length), '--since-baseline');
      continue;
    }

    if (arg === '--fail-on-new-drift') {
      parsed.failOnNewDrift = true;
      continue;
    }

    if (arg === '--max-findings') {
      parsed.maxFindings = parseNonNegativeInteger(argv[++index], '--max-findings');
      continue;
    }

    if (arg.startsWith('--max-findings=')) {
      parsed.maxFindings = parseNonNegativeInteger(arg.slice('--max-findings='.length), '--max-findings');
      continue;
    }

    if (arg === '--min-cleanliness') {
      parsed.minCleanliness = parsePercentage(argv[++index], '--min-cleanliness');
      continue;
    }

    if (arg.startsWith('--min-cleanliness=')) {
      parsed.minCleanliness = parsePercentage(
        arg.slice('--min-cleanliness='.length),
        '--min-cleanliness',
      );
      continue;
    }

    if (arg === '--since') {
      parsed.since = parsePathOption(argv[++index], '--since');
      continue;
    }

    if (arg.startsWith('--since=')) {
      parsed.since = parsePathOption(arg.slice('--since='.length), '--since');
      continue;
    }

    if (arg === '--staged') {
      parsed.staged = true;
      continue;
    }

    if (arg === '--token-candidate-min-count') {
      parsed.tokenCandidateMinCount = parsePositiveInteger(argv[++index], '--token-candidate-min-count');
      continue;
    }

    if (arg.startsWith('--token-candidate-min-count=')) {
      parsed.tokenCandidateMinCount = parsePositiveInteger(
        arg.slice('--token-candidate-min-count='.length),
        '--token-candidate-min-count',
      );
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

  if (parsed.since && parsed.staged) {
    throw new Error('Use either --since or --staged, not both.');
  }

  if (parsed.failOnNewDrift && !parsed.sinceBaseline) {
    throw new Error('--fail-on-new-drift requires --since-baseline.');
  }

  return parsed;
}

function parsePathOption(raw, optionName) {
  if (!raw) {
    throw new Error(`Missing value for ${optionName}.`);
  }

  return String(raw);
}

function parseNonNegativeInteger(raw, optionName) {
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${optionName} must be a non-negative integer.`);
  }

  return value;
}

function parsePositiveInteger(raw, optionName) {
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${optionName} must be a positive integer.`);
  }

  return value;
}

function parsePercentage(raw, optionName) {
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0 || value > 100) {
    throw new Error(`${optionName} must be a number between 0 and 100.`);
  }

  return value;
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

function loadIgnorePatterns(ignorePath) {
  if (!ignorePath) {
    return [];
  }

  const resolvedPath = path.resolve(process.cwd(), ignorePath);
  if (!fs.existsSync(resolvedPath)) {
    if (ignorePath === DEFAULT_IGNORE_PATH) {
      return [];
    }
    throw new Error(`Ignore file not found: ${ignorePath}`);
  }

  return fs.readFileSync(resolvedPath, 'utf8')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'))
    .map((line) => normalizeIgnorePattern(line))
    .filter(Boolean);
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

function getScanFiles(rootDir, ignorePatterns, parsed) {
  if (parsed.staged || parsed.since) {
    return getGitChangedScanFiles(rootDir, ignorePatterns, parsed);
  }

  return {
    ...walkFiles(rootDir, ignorePatterns),
    scanScope: {
      mode: 'full',
    },
  };
}

function getGitChangedScanFiles(rootDir, ignorePatterns, parsed) {
  const args = parsed.staged
    ? ['diff', '--name-only', '--cached', '--diff-filter=ACMR', '--']
    : ['diff', '--name-only', '--diff-filter=ACMR', parsed.since, '--'];
  let output = '';

  try {
    output = execFileSync('git', args, {
      cwd: process.cwd(),
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (err) {
    const stderr = err.stderr ? String(err.stderr).trim() : err.message;
    throw new Error(`Unable to read changed files from git: ${stderr}`);
  }

  const cssFiles = [];
  const templateFiles = [];
  const ignoreMatchers = createIgnoreMatchers(ignorePatterns);
  const seen = new Set();
  const changedFiles = output.split(/\r?\n/)
    .map((filePath) => filePath.trim())
    .filter(Boolean);

  for (const filePath of changedFiles) {
    const fullPath = path.resolve(process.cwd(), filePath);

    if (!isPathInside(rootDir, fullPath) || seen.has(fullPath) || !fs.existsSync(fullPath)) {
      continue;
    }

    const stat = fs.statSync(fullPath);
    if (!stat.isFile()) {
      continue;
    }

    const relativePath = toPosixRelativePath(rootDir, fullPath);
    if (shouldIgnoreRelativeFile(relativePath, ignoreMatchers)) {
      continue;
    }

    seen.add(fullPath);
    if (isCssFile(fullPath)) {
      cssFiles.push(fullPath);
    } else if (isTemplateFile(fullPath)) {
      templateFiles.push(fullPath);
    }
  }

  return {
    cssFiles,
    scanScope: {
      changedFiles: changedFiles.length,
      mode: parsed.staged ? 'staged' : 'since',
      since: parsed.since,
    },
    templateFiles,
  };
}

function isPathInside(rootDir, filePath) {
  const relativePath = path.relative(rootDir, filePath);
  return relativePath === '' || (!relativePath.startsWith('..') && !path.isAbsolute(relativePath));
}

function shouldIgnorePath(relativePath, entry, ignoreMatchers) {
  return ignoreMatchers.some((matcher) => matcher.test(relativePath))
    || (entry.isDirectory() && SKIP_DIRS.has(entry.name));
}

function shouldIgnoreRelativeFile(relativePath, ignoreMatchers) {
  const segments = relativePath.split('/');
  return segments.some((segment) => SKIP_DIRS.has(segment))
    || ignoreMatchers.some((matcher) => matcher.test(relativePath));
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

function collectTokenContract(cssFiles, cssFindings, tailwindFindings, minCandidateCount) {
  const definitions = new Map();
  const uses = new Map();
  const rawValues = new Map();
  const rawValueLocations = new Set();

  for (const filePath of cssFiles) {
    let source = '';
    try {
      source = fs.readFileSync(filePath, 'utf8');
    } catch {
      continue;
    }

    const file = formatPath(filePath);
    collectTokenDefinitions(source, file, definitions);
    collectTokenUses(source, file, uses);
  }

  for (const finding of cssFindings) {
    addRawValue(rawValues, rawValueLocations, finding.value, finding);
  }

  for (const finding of tailwindFindings) {
    addRawValue(rawValues, rawValueLocations, finding.rawValue, finding);
  }

  const definedTokens = mapTokenEntries(definitions);
  const usedTokens = mapTokenEntries(uses);
  const missingTokens = usedTokens.filter(({ token }) => !definitions.has(token));
  const unusedTokens = definedTokens.filter(({ token }) => !uses.has(token));
  const rawValueCandidates = Array.from(rawValues.entries())
    .map(([value, entry]) => ({
      count: entry.count,
      files: Array.from(entry.files).sort(),
      value,
    }))
    .filter(({ count }) => count >= minCandidateCount)
    .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));

  return {
    definedTokens,
    missingTokens,
    rawValueCandidates,
    summary: {
      definedTokens: definedTokens.length,
      missingTokens: missingTokens.length,
      rawValueCandidates: rawValueCandidates.length,
      unusedTokens: unusedTokens.length,
      usedTokens: usedTokens.length,
    },
    unusedTokens,
    usedTokens,
  };
}

function collectTokenDefinitions(source, file, definitions) {
  const declarationPattern = /(--[\w-]+)\s*:\s*([^;{}]+)/g;
  let match;

  while ((match = declarationPattern.exec(source)) !== null) {
    const token = match[1];
    if (!isSpacingToken(token)) {
      continue;
    }

    const entry = definitions.get(token) || {
      files: new Set(),
      token,
      values: new Set(),
    };
    entry.files.add(file);
    entry.values.add(match[2].trim());
    definitions.set(token, entry);
  }
}

function collectTokenUses(source, file, uses) {
  const varPattern = /var\(\s*(--[\w-]+)/g;
  let match;

  while ((match = varPattern.exec(source)) !== null) {
    const token = match[1];
    if (!isSpacingToken(token)) {
      continue;
    }

    const entry = uses.get(token) || {
      files: new Set(),
      token,
    };
    entry.files.add(file);
    uses.set(token, entry);
  }
}

function isSpacingToken(token) {
  return new RegExp(DEFAULT_TOKEN_PATTERN).test(token);
}

function addRawValue(rawValues, rawValueLocations, value, finding) {
  if (!value) {
    return;
  }

  const locationKey = [
    finding.file || '',
    finding.line || '',
    finding.column || '',
    value,
  ].join('\u001f');
  if (rawValueLocations.has(locationKey)) {
    return;
  }
  rawValueLocations.add(locationKey);

  const entry = rawValues.get(value) || {
    count: 0,
    files: new Set(),
  };
  entry.count += 1;
  if (finding.file) {
    entry.files.add(finding.file);
  }
  rawValues.set(value, entry);
}

function mapTokenEntries(entries) {
  return Array.from(entries.values())
    .map((entry) => ({
      files: Array.from(entry.files).sort(),
      token: entry.token,
      values: entry.values ? Array.from(entry.values).sort() : undefined,
    }))
    .sort((a, b) => a.token.localeCompare(b.token));
}

function buildReport({
  cssFiles,
  cssFindings,
  dir,
  scanScope,
  templateFiles,
  tailwindFindings,
  tokenCandidateMinCount,
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
  const tokenContract = collectTokenContract(
    cssFiles,
    cssFindings,
    tailwindFindings,
    tokenCandidateMinCount,
  );

  return {
    cssFilesScanned: cssFiles.length,
    directory: dir,
    filesWithIssues,
    findings: {
      css: cssFindings,
      tailwind: tailwindFindings,
    },
    formatVersion: 3,
    offScaleValues: Object.fromEntries(sortCountMap(offScaleValues).slice(0, 10)),
    scaleCleanliness,
    scanScope,
    scanned: {
      cssFiles: cssFiles.length,
      templateFiles: templateFiles.length,
      totalFiles,
    },
    summary: {
      cssWarnings: cssFindings.length,
      filesWithIssues,
      missingTokens: tokenContract.summary.missingTokens,
      rawValueCandidates: tokenContract.summary.rawValueCandidates,
      scaleCleanliness,
      tailwindArbitrarySpacing: tailwindFindings.length,
      tokenOpportunities: sumCounts(tokenOpportunities),
      totalFindings: totalWarnings,
      unusedTokens: tokenContract.summary.unusedTokens,
    },
    tailwindArbitraryValues: Object.fromEntries(sortCountMap(tailwindArbitraryValues).slice(0, 10)),
    templateFilesScanned: templateFiles.length,
    tokenContract,
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

function applyBaselineComparison(report, baselinePath) {
  const resolvedPath = path.resolve(process.cwd(), baselinePath);
  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`Baseline file not found: ${baselinePath}`);
  }

  const baseline = JSON.parse(fs.readFileSync(resolvedPath, 'utf8'));
  const baselineFindings = Array.isArray(baseline.findings) ? baseline.findings : [];
  const baselineKeys = new Set(baselineFindings.map((finding) => finding.key || createFindingKey(finding)));
  const currentFindings = getAllFindings(report);
  const currentKeys = new Set(currentFindings.map(createFindingKey));
  const newFindings = currentFindings.filter((finding) => !baselineKeys.has(createFindingKey(finding)));
  const resolvedFindings = baselineFindings.filter((finding) => !currentKeys.has(finding.key || createFindingKey(finding)));

  report.baseline = {
    baselineFindings: baselineFindings.length,
    file: formatPath(resolvedPath),
    newFindings,
    newFindingsCount: newFindings.length,
    resolvedFindingsCount: resolvedFindings.length,
  };
  report.summary.newFindings = newFindings.length;
  report.summary.resolvedFindings = resolvedFindings.length;
}

function writeBaseline(report, baselinePath) {
  const resolvedPath = path.resolve(process.cwd(), baselinePath);
  fs.mkdirSync(path.dirname(resolvedPath), { recursive: true });
  fs.writeFileSync(
    resolvedPath,
    `${JSON.stringify({
      createdAt: new Date().toISOString(),
      directory: report.directory,
      findings: getAllFindings(report).map(toBaselineFinding),
      formatVersion: 1,
      summary: {
        scaleCleanliness: report.scaleCleanliness,
        totalFindings: report.totalWarnings,
      },
    }, null, 2)}\n`,
  );

  report.baselineWritten = {
    file: formatPath(resolvedPath),
    findings: report.totalWarnings,
  };
}

function getAllFindings(report) {
  return [
    ...report.findings.css,
    ...report.findings.tailwind,
  ];
}

function toBaselineFinding(finding) {
  return {
    column: finding.column,
    file: finding.file,
    key: createFindingKey(finding),
    line: finding.line,
    rule: finding.rule,
    text: finding.text,
    token: finding.token,
    type: finding.type,
    value: finding.value || finding.rawValue,
  };
}

function createFindingKey(finding) {
  return [
    finding.rule || '',
    finding.type || '',
    finding.file || '',
    finding.line || '',
    finding.column || '',
    finding.value || finding.rawValue || finding.token || '',
    finding.text || '',
  ].join('\u001f');
}

function getAuditFailures(report, parsed) {
  const failures = [];

  if (parsed.maxFindings !== null && report.totalWarnings > parsed.maxFindings) {
    failures.push(`total findings ${report.totalWarnings} exceeds --max-findings ${parsed.maxFindings}`);
  }

  if (parsed.minCleanliness !== null && report.scaleCleanliness < parsed.minCleanliness) {
    failures.push(`scale cleanliness ${report.scaleCleanliness}% is below --min-cleanliness ${parsed.minCleanliness}%`);
  }

  if (parsed.failOnNewDrift && report.baseline && report.baseline.newFindingsCount > 0) {
    failures.push(`new drift found: ${report.baseline.newFindingsCount} finding(s) not present in baseline`);
  }

  return failures;
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
  appendTokenContractText(lines, report.tokenContract);
  appendBaselineText(lines, report);

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

function appendTokenContractText(lines, tokenContract) {
  const { missingTokens, rawValueCandidates, unusedTokens } = tokenContract;
  if (missingTokens.length === 0 && rawValueCandidates.length === 0 && unusedTokens.length === 0) {
    return;
  }

  lines.push('  ── TOKEN CONTRACT ──');
  lines.push('');

  if (missingTokens.length > 0) {
    lines.push(`  Missing tokens         ${missingTokens.length}`);
    for (const entry of missingTokens.slice(0, 5)) {
      lines.push(`    ${entry.token} (${truncate(entry.files.join(', '), 42)})`);
    }
  }

  if (unusedTokens.length > 0) {
    lines.push(`  Defined but unused     ${unusedTokens.length}`);
    for (const entry of unusedTokens.slice(0, 5)) {
      lines.push(`    ${entry.token}`);
    }
  }

  if (rawValueCandidates.length > 0) {
    lines.push(`  Repeated raw values    ${rawValueCandidates.length}`);
    for (const entry of rawValueCandidates.slice(0, 5)) {
      lines.push(`    ${entry.value.padEnd(14)} ${entry.count}`);
    }
  }

  lines.push('');
}

function appendBaselineText(lines, report) {
  if (report.baseline) {
    lines.push('  ── BASELINE COMPARISON ──');
    lines.push('');
    lines.push(`  Baseline findings      ${String(report.baseline.baselineFindings).padStart(4)}`);
    lines.push(`  New findings           ${String(report.baseline.newFindingsCount).padStart(4)}`);
    lines.push(`  Resolved findings      ${String(report.baseline.resolvedFindingsCount).padStart(4)}`);
    lines.push('');
  }

  if (report.baselineWritten) {
    lines.push(`  Baseline written       ${report.baselineWritten.file}`);
    lines.push('');
  }
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
  ];

  if (report.baseline) {
    lines.push(`| New findings | ${report.baseline.newFindingsCount} |`);
    lines.push(`| Resolved findings | ${report.baseline.resolvedFindingsCount} |`);
  }
  lines.push('');

  appendMarkdownCounts(lines, 'CSS Off-Scale Values', report.offScaleValues);
  appendMarkdownCounts(lines, 'CSS Token Opportunities', report.tokenOpportunities);
  appendMarkdownCounts(lines, 'Tailwind Class-String Drift', report.tailwindArbitraryValues);
  appendTokenContractMarkdown(lines, report.tokenContract);
  appendBaselineMarkdown(lines, report);

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

function appendTokenContractMarkdown(lines, tokenContract) {
  const { missingTokens, rawValueCandidates, unusedTokens } = tokenContract;
  if (missingTokens.length === 0 && rawValueCandidates.length === 0 && unusedTokens.length === 0) {
    return;
  }

  lines.push('## Token Contract');
  lines.push('');

  if (missingTokens.length > 0) {
    lines.push('### Tokens Used But Missing');
    lines.push('');
    lines.push('| Token | Files |');
    lines.push('| --- | --- |');
    for (const entry of missingTokens.slice(0, 10)) {
      lines.push(`| \`${escapeMarkdown(entry.token)}\` | \`${escapeMarkdown(entry.files.join(', '))}\` |`);
    }
    lines.push('');
  }

  if (unusedTokens.length > 0) {
    lines.push('### Tokens Defined But Unused');
    lines.push('');
    lines.push('| Token | Value |');
    lines.push('| --- | --- |');
    for (const entry of unusedTokens.slice(0, 10)) {
      lines.push(`| \`${escapeMarkdown(entry.token)}\` | \`${escapeMarkdown((entry.values || []).join(', ') || 'n/a')}\` |`);
    }
    lines.push('');
  }

  if (rawValueCandidates.length > 0) {
    lines.push('### Repeated Raw Value Candidates');
    lines.push('');
    lines.push('| Value | Count | Files |');
    lines.push('| --- | ---: | --- |');
    for (const entry of rawValueCandidates.slice(0, 10)) {
      lines.push(`| \`${escapeMarkdown(entry.value)}\` | ${entry.count} | \`${escapeMarkdown(entry.files.join(', '))}\` |`);
    }
    lines.push('');
  }
}

function appendBaselineMarkdown(lines, report) {
  if (!report.baseline && !report.baselineWritten) {
    return;
  }

  lines.push('## Baseline');
  lines.push('');

  if (report.baseline) {
    lines.push('| Metric | Value |');
    lines.push('| --- | ---: |');
    lines.push(`| Baseline findings | ${report.baseline.baselineFindings} |`);
    lines.push(`| New findings | ${report.baseline.newFindingsCount} |`);
    lines.push(`| Resolved findings | ${report.baseline.resolvedFindingsCount} |`);
    lines.push('');
  }

  if (report.baseline && report.baseline.newFindings.length > 0) {
    lines.push('| New finding | Location |');
    lines.push('| --- | --- |');
    for (const finding of report.baseline.newFindings.slice(0, 10)) {
      lines.push(`| \`${escapeMarkdown(finding.text)}\` | \`${escapeMarkdown(`${finding.file}:${finding.line}`)}\` |`);
    }
    lines.push('');
  }

  if (report.baselineWritten) {
    lines.push(`Baseline written: \`${escapeMarkdown(report.baselineWritten.file)}\``);
    lines.push('');
  }
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
  let ignorePatterns;
  try {
    ignorePatterns = [
      ...loadIgnorePatterns(parsed.ignorePath),
      ...parsed.ignorePatterns,
    ];
  } catch (err) {
    process.stderr.write(`${err.message}\n`);
    process.exit(1);
  }

  let scanFiles;
  try {
    scanFiles = getScanFiles(resolvedDir, ignorePatterns, parsed);
  } catch (err) {
    process.stderr.write(`${err.message}\n`);
    process.exit(1);
  }

  const { cssFiles, scanScope, templateFiles } = scanFiles;
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
    scanScope,
    tailwindFindings: collectTailwindFindings(templateFiles, options),
    templateFiles,
    tokenCandidateMinCount: parsed.tokenCandidateMinCount,
  });

  try {
    if (parsed.sinceBaseline) {
      applyBaselineComparison(report, parsed.baselinePath);
    }

    if (parsed.writeBaseline) {
      writeBaseline(report, parsed.baselinePath);
    }
  } catch (err) {
    process.stderr.write(`${err.message}\n`);
    process.exit(1);
  }

  const auditFailures = getAuditFailures(report, parsed);

  if (parsed.format === 'json') {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    finish(auditFailures);
    return;
  }

  if (parsed.format === 'markdown') {
    process.stdout.write(renderMarkdown(report));
    finish(auditFailures);
    return;
  }

  process.stdout.write(renderText(report));
  finish(auditFailures);
}

function finish(auditFailures) {
  if (auditFailures.length === 0) {
    return;
  }

  process.stderr.write(`Audit failed: ${auditFailures.join('; ')}\n`);
  process.exitCode = 1;
}

run();
