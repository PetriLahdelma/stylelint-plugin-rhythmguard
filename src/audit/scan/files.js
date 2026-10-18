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

/**
 * Every stylesheet and template under `rootDir`. Symbolic links are followed:
 * a linked directory is walked unless it is one of the directories being
 * walked already (a cycle), and a file reached by more than one path is
 * scanned once, under its own path when the walk reaches it directly, else
 * under the first linked path in sorted order (#289). A broken link is skipped.
 */
function walkFiles(rootDir, ignorePatterns = []) {
  const ignoreMatchers = createIgnoreMatchers(ignorePatterns);
  const found = [];

  // `realDir` is where `currentDir` really is. Below a plain directory that is
  // its real path plus the entry name, so only a link costs a realpath call.
  function walk(currentDir, realDir, ancestors, viaLink) {
    for (const entry of fs.readdirSync(currentDir, { withFileTypes: true })) {
      const fullPath = path.join(currentDir, entry.name);
      const relativePath = toPosixRelativePath(rootDir, fullPath);
      const link = entry.isSymbolicLink();
      let kind = entry;
      if (link) {
        try {
          kind = fs.statSync(fullPath);
        } catch {
          continue;
        }
      }

      if (shouldIgnorePath(relativePath, { isDirectory: () => kind.isDirectory(), name: entry.name }, ignoreMatchers)) {
        continue;
      }

      const realPath = link ? realPathOf(fullPath) : path.join(realDir, entry.name);
      if (!realPath) {
        continue;
      }

      if (kind.isDirectory()) {
        if (!ancestors.has(realPath)) {
          walk(fullPath, realPath, new Set([...ancestors, realPath]), viaLink || link);
        }
        continue;
      }

      if (kind.isFile() && (isCssFile(fullPath) || isTemplateFile(fullPath))) {
        found.push({ fullPath, realPath, viaLink: viaLink || link });
      }
    }
  }

  const realRoot = realPathOf(rootDir) || rootDir;
  walk(rootDir, realRoot, new Set([realRoot]), false);

  const chosen = new Map();
  for (const file of found) {
    const current = chosen.get(file.realPath);
    if (!current || preferPath(file, current)) {
      chosen.set(file.realPath, file);
    }
  }
  const cssFiles = [];
  const templateFiles = [];
  for (const file of found) {
    if (chosen.get(file.realPath) !== file) {
      continue;
    }
    (isCssFile(file.fullPath) ? cssFiles : templateFiles).push(file.fullPath);
  }
  return { cssFiles, templateFiles };
}

// A direct path beats a linked one; between two of a kind, the first in sorted order.
function preferPath(candidate, current) {
  if (candidate.viaLink !== current.viaLink) {
    return !candidate.viaLink;
  }
  return candidate.fullPath < current.fullPath;
}

function realPathOf(filePath) {
  try {
    return fs.realpathSync(filePath);
  } catch {
    return null;
  }
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
  // Git runs in the scanned directory, so the repository is the one that holds
  // the files, whichever directory the command was started from.
  const topLevel = runGit(rootDir, ['rev-parse', '--show-toplevel']).replace(/\r?\n$/, '');
  const changed = parsed.staged
    ? listStagedFiles(rootDir)
    : listFilesChangedSince(rootDir, parsed.since);

  // git reports the top level with symlinks resolved (/private/var on macOS);
  // compare in that form, then name files under the directory as it was given.
  const realRootDir = fs.realpathSync(rootDir);
  const ignoreMatchers = createIgnoreMatchers(ignorePatterns);
  const seen = new Set();
  const found = [];

  for (const entry of changed) {
    const realPath = path.resolve(topLevel, entry.path);
    if (!isPathInside(realRootDir, realPath)) {
      continue;
    }
    const fullPath = path.join(rootDir, path.relative(realRootDir, realPath));
    if (seen.has(fullPath)) {
      continue;
    }

    // A staged regular file is read from its index blob: that is what gets
    // committed, whatever the working tree holds now, or whether the file is
    // still there at all. A staged symbolic link is followed on disk, as a
    // changed one is in a --since run (#289).
    const link = entry.mode === SYMLINK_MODE;
    if (parsed.staged && !REGULAR_FILE_MODES.has(entry.mode) && !link) {
      continue;
    }
    if ((!parsed.staged || link) && !isFileOnDisk(fullPath)) {
      continue;
    }
    if (!isCssFile(fullPath) && !isTemplateFile(fullPath)) {
      continue;
    }

    const relativePath = toPosixRelativePath(rootDir, fullPath);
    if (shouldIgnoreRelativeFile(relativePath, ignoreMatchers)) {
      continue;
    }

    seen.add(fullPath);
    found.push({
      blob: parsed.staged && !link ? entry.blob : null,
      fullPath,
      realPath: realPathOf(fullPath) || fullPath,
      viaLink: link || isSymbolicLink(fullPath),
    });
  }

  // A file changed under two paths (itself and a link to it) is scanned once.
  const chosen = new Map();
  for (const file of found) {
    const current = chosen.get(file.realPath);
    if (!current || preferPath(file, current)) {
      chosen.set(file.realPath, file);
    }
  }
  const cssFiles = [];
  const templateFiles = [];
  const stagedBlobs = new Map();
  for (const file of found) {
    if (chosen.get(file.realPath) !== file) {
      continue;
    }
    (isCssFile(file.fullPath) ? cssFiles : templateFiles).push(file.fullPath);
    if (file.blob) {
      stagedBlobs.set(file.fullPath, file.blob);
    }
  }

  const result = {
    cssFiles,
    scanScope: {
      changedFiles: changed.length,
      mode: parsed.staged ? 'staged' : 'since',
      since: parsed.since,
    },
    templateFiles,
  };

  if (parsed.staged) {
    result.readSource = createStagedSourceReader(rootDir, stagedBlobs);
  }

  return result;
}

const REGULAR_FILE_MODES = new Set(['100644', '100755']);
const SYMLINK_MODE = '120000';

function isFileOnDisk(filePath) {
  try {
    return fs.statSync(filePath).isFile();
  } catch {
    return false;
  }
}

function isSymbolicLink(filePath) {
  try {
    return fs.lstatSync(filePath).isSymbolicLink();
  } catch {
    return false;
  }
}

// -z prints names raw and NUL-separated: no quoting of spaces or non-ASCII
// bytes. diff.relative is pinned off so every name is relative to the
// repository top level, whatever the user's git config says.
function listFilesChangedSince(rootDir, since) {
  const output = runGit(rootDir, ['-c', 'diff.relative=false', 'diff', '--name-only', '-z', '--diff-filter=ACMR', since, '--']);
  return output.split('\0').filter(Boolean).map((filePath) => ({ path: filePath }));
}

/**
 * Staged files with the mode and blob id the index holds for each. `--raw -z`
 * prints `:<old mode> <new mode> <old id> <new id> <status>` and then the path,
 * or two paths (from, then to) for a rename or a copy.
 */
function listStagedFiles(rootDir) {
  const output = runGit(rootDir, [
    '-c', 'diff.relative=false',
    'diff', '--cached', '--raw', '-z', '--no-abbrev', '--no-color', '--diff-filter=ACMR', '--',
  ]);
  const fields = output.split('\0');
  const entries = [];
  for (let index = 0; index < fields.length; index++) {
    const header = fields[index];
    if (!header.startsWith(':')) {
      continue;
    }
    const [, mode, , blob, status = ''] = header.slice(1).split(' ');
    const pathCount = /^[RC]/.test(status) ? 2 : 1;
    const filePath = fields[index + pathCount];
    index += pathCount;
    if (filePath) {
      entries.push({ blob, mode, path: filePath });
    }
  }
  return entries;
}

/**
 * Reads staged files from their index blobs, fetched in one `git cat-file
 * --batch` call, and any other path from disk. Each blob comes back as a
 * `<id> blob <size>` line followed by exactly <size> bytes and a newline.
 */
function createStagedSourceReader(rootDir, stagedBlobs) {
  const contents = new Map();
  const ids = Array.from(new Set(stagedBlobs.values()));
  if (ids.length > 0) {
    const output = runGit(rootDir, ['cat-file', '--batch'], `${ids.join('\n')}\n`, null);
    const byId = new Map();
    let offset = 0;
    while (offset < output.length) {
      const headerEnd = output.indexOf(0x0a, offset);
      if (headerEnd === -1) {
        break;
      }
      const [id, type, size] = output.subarray(offset, headerEnd).toString('utf8').split(' ');
      offset = headerEnd + 1;
      if (type !== 'blob') {
        continue;
      }
      const length = Number(size);
      byId.set(id, output.subarray(offset, offset + length).toString('utf8'));
      offset += length + 1;
    }
    for (const [filePath, id] of stagedBlobs) {
      if (byId.has(id)) {
        contents.set(filePath, byId.get(id));
      }
    }
  }

  return (filePath) => (contents.has(filePath)
    ? contents.get(filePath)
    : readSourceFromDisk(filePath));
}

/** Reads a scanned file from disk. A staged run swaps in a reader for the index. */
function readSourceFromDisk(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

/**
 * The repository top level for a directory, with symlinks resolved, or null
 * when the directory is not inside a git work tree (or git is not installed).
 */
function findGitTopLevel(dir) {
  try {
    const output = execFileSync('git', ['rev-parse', '--show-toplevel'], {
      cwd: dir,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).replace(/\r?\n$/, '');
    return output ? path.resolve(output) : null;
  } catch {
    return null;
  }
}

// With `encoding` null the output comes back as a Buffer (blob sizes are bytes).
function runGit(cwd, args, input, encoding = 'utf8') {
  try {
    return execFileSync('git', args, {
      cwd,
      encoding,
      input,
      maxBuffer: 1024 * 1024 * 1024,
      stdio: [input === undefined ? 'ignore' : 'pipe', 'pipe', 'pipe'],
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
  findGitTopLevel,
  getGitChangedScanFiles,
  getScanFiles,
  globToRegExp,
  hasGlob,
  isCssFile,
  isPathInside,
  isScssFile,
  isTemplateFile,
  readSourceFromDisk,
  shouldIgnorePath,
  shouldIgnoreRelativeFile,
  toPosixRelativePath,
  walkFiles,
};
