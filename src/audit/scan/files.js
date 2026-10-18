'use strict';

/**
 * Which files the audit looks at: directory walking, ignore patterns (root-relative
 * paths and globs), git-scoped selection (--since, --staged), and the file-type
 * predicates. Nothing here parses CSS.
 */
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const {
  SKIP_DIRS,
  TEMPLATE_EXTENSIONS,
} = require('../shared');

function assertDirectory(dir) {
  if (!dir) {
    throw new Error('Missing audit directory.');
  }

  const resolvedDir = path.resolve(dir);
  if (!fs.existsSync(resolvedDir)) {
    throw new Error(`Directory not found: ${dir}`);
  }

  if (!fs.statSync(resolvedDir).isDirectory()) {
    throw new Error(`Not a directory: ${dir}`);
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
  // -z prints names raw and NUL-separated: no quoting of spaces or non-ASCII
  // bytes. diff.relative is pinned off so every name is relative to the
  // repository top level, whatever the user's git config says.
  const diffArgs = parsed.staged
    ? ['diff', '--name-only', '-z', '--cached', '--diff-filter=ACMR', '--']
    : ['diff', '--name-only', '-z', '--diff-filter=ACMR', parsed.since, '--'];
  // Git runs in the scanned directory, so the repository is the one that holds
  // the files, whichever directory the command was started from.
  const topLevel = runGit(rootDir, ['rev-parse', '--show-toplevel']).replace(/\r?\n$/, '');
  const output = runGit(rootDir, ['-c', 'diff.relative=false', ...diffArgs]);

  // git reports the top level with symlinks resolved (/private/var on macOS);
  // compare in that form, then name files under the directory as it was given.
  const realRootDir = fs.realpathSync(rootDir);
  const changedFiles = output.split('\0').filter(Boolean);
  const changedPaths = [];
  for (const filePath of changedFiles) {
    const realPath = path.resolve(topLevel, filePath);
    if (isPathInside(realRootDir, realPath)) {
      changedPaths.push(path.join(rootDir, path.relative(realRootDir, realPath)));
    }
  }

  const cssFiles = [];
  const templateFiles = [];
  const ignoreMatchers = createIgnoreMatchers(ignorePatterns);
  const seen = new Set();

  for (const fullPath of changedPaths) {
    if (seen.has(fullPath) || !fs.existsSync(fullPath)) {
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

function runGit(cwd, args) {
  try {
    return execFileSync('git', args, {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (err) {
    const stderr = err.stderr ? String(err.stderr).trim() : err.message;
    throw new Error(`Unable to read changed files from git: ${stderr}`, { cause: err });
  }
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

function isScssFile(filePath) {
  return filePath.endsWith('.scss');
}

// "CSS files" in the audit means authored stylesheets: .css always, .scss too;
// whether .scss can be parsed is decided when the run starts (stylesheets.js).
function isCssFile(filePath) {
  return filePath.endsWith('.css') || isScssFile(filePath);
}

function isTemplateFile(filePath) {
  return TEMPLATE_EXTENSIONS.has(path.extname(filePath));
}

module.exports = {
  addIgnorePatternVariants,
  assertDirectory,
  createIgnoreMatchers,
  escapeRegExp,
  getGitChangedScanFiles,
  getScanFiles,
  globToRegExp,
  hasGlob,
  isCssFile,
  isPathInside,
  isScssFile,
  isTemplateFile,
  shouldIgnorePath,
  shouldIgnoreRelativeFile,
  toPosixRelativePath,
  walkFiles,
};
