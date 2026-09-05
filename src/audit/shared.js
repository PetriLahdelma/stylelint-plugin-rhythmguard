'use strict';

const path = require('node:path');

const pluginPath = path.resolve(__dirname, '..', 'index.js');

const DEFAULT_SCALE = [0, 4, 8, 12, 16, 24, 32];

const DEFAULT_BASE_FONT_SIZE = 16;

const DEFAULT_BASELINE_PATH = '.rhythmguard-baseline.json';

const DEFAULT_CONFIG_PATH = '.rhythmguardrc.json';

const DEFAULT_IGNORE_PATH = '.rhythmguardignore';

const DEFAULT_AUDIT_TOKEN_PATTERN = '^--(space|spacing)-';

const DEFAULT_TOKEN_CANDIDATE_MIN_COUNT = 2;

const VALID_FORMATS = new Set(['text', 'json', 'json-v1', 'markdown', 'html', 'github']);

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

function formatPath(filePath) {
  return path.relative(process.cwd(), filePath).replace(/\\/g, '/');
}

function normalizeIgnorePattern(pattern) {
  return String(pattern)
    .trim()
    .replace(/\\/g, '/')
    .replace(/^\/+/, '')
    .replace(/^\.\//, '')
    .replace(/\/+$/, '');
}

function createDefaultAuditOptions() {
  return {
    baselinePath: DEFAULT_BASELINE_PATH,
    baseFontSize: DEFAULT_BASE_FONT_SIZE,
    cliOptions: new Set(),
    configExplicit: false,
    configPath: DEFAULT_CONFIG_PATH,
    dir: null,
    failOnNewDrift: false,
    format: 'text',
    ignorePath: DEFAULT_IGNORE_PATH,
    ignorePatterns: [],
    includeMotion: false,
    maxFindings: null,
    minCleanliness: null,
    noConfig: false,
    outputPath: null,
    scale: DEFAULT_SCALE,
    schema: false,
    since: null,
    sinceBaseline: false,
    staged: false,
    tokenCandidateMinCount: DEFAULT_TOKEN_CANDIDATE_MIN_COUNT,
    tokenKind: 'spacing',
    tokenSourceFormat: 'auto',
    tokenSources: [],
    writeBaseline: false,
  };
}

module.exports = {
  DEFAULT_AUDIT_TOKEN_PATTERN,
  DEFAULT_BASELINE_PATH,
  DEFAULT_BASE_FONT_SIZE,
  DEFAULT_CONFIG_PATH,
  DEFAULT_IGNORE_PATH,
  DEFAULT_SCALE,
  DEFAULT_TOKEN_CANDIDATE_MIN_COUNT,
  SKIP_DIRS,
  TEMPLATE_EXTENSIONS,
  VALID_FORMATS,
  createDefaultAuditOptions,
  formatPath,
  normalizeIgnorePattern,
  pluginPath,
};
