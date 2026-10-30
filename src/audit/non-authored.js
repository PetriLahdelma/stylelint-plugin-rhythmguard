'use strict';

/**
 * What the audit counts as non-authored CSS (#161): vendored, test, generated
 * and built stylesheets. One definition for every part of the audit: scale
 * inference and token chains never read these files, and the findings side
 * skips them unless `--include-non-authored` is passed. The quiet benchmark's
 * `noise:non-authored` path rule covers the same segments.
 */

/**
 * A path segment that marks a directory as not written by the project: tests
 * and fixtures, vendored and third-party code, generated output and Storybook
 * builds. Matched against the root-relative path, whole segments only, so
 * `src/vendorize.css` stays authored. `lib` and `libs` are not on the list:
 * Discourse's `stylesheets/lib/`, SvelteKit's `src/lib/` and Nx's `libs/`
 * hold the project's own code.
 */
const NON_AUTHORED_SEGMENT = /(^|\/)(test|tests|__tests__|spec|specs|fixtures?|__fixtures__|__snapshots__|e2e|vendors?|third[-_]?party|jquery-ui|font-?awesome|generated|node_modules|dist|build|storybook-static|\.storybook)(\/|$)/i;

const MINIFIED_FILE = /\.min\.css$/i;

/**
 * A built bundle: its code, comments aside, is one line longer than this many
 * bytes. 5 KB is well past any hand-written one-line stylesheet (a reset or a
 * single component) and well under a framework or app bundle, which run from
 * tens of KB up. A license banner or a trailing source map comment on lines of
 * their own does not make a bundle multi-line.
 */
const BUNDLE_MIN_BYTES = 5 * 1024;

const COMMENT = /\/\*[\s\S]*?\*\//g;

function isNonAuthoredPath(relativePath) {
  const file = String(relativePath).replace(/\\/g, '/');
  return NON_AUTHORED_SEGMENT.test(file) || MINIFIED_FILE.test(file);
}

function isBuiltBundle(source) {
  const text = String(source);
  if (Buffer.byteLength(text, 'utf8') <= BUNDLE_MIN_BYTES) {
    return false;
  }
  const code = (text.includes('/*') ? text.replace(COMMENT, '') : text).trim();
  return !code.includes('\n') && Buffer.byteLength(code, 'utf8') > BUNDLE_MIN_BYTES;
}

/**
 * Why a stylesheet is not authored, or null when it is: `path` for a
 * non-authored directory, `minified` for `*.min.css`, `bundle` for a one-line
 * stylesheet over 5 KB. The file is read only when its path does not decide;
 * one that cannot be read is left to the audit, which reports it.
 */
function nonAuthoredReason(relativePath, readSource) {
  const file = String(relativePath).replace(/\\/g, '/');
  if (NON_AUTHORED_SEGMENT.test(file)) {
    return 'path';
  }
  if (MINIFIED_FILE.test(file)) {
    return 'minified';
  }
  let source;
  try {
    source = readSource();
  } catch {
    return null;
  }
  return isBuiltBundle(source) ? 'bundle' : null;
}

module.exports = {
  BUNDLE_MIN_BYTES,
  NON_AUTHORED_SEGMENT,
  isBuiltBundle,
  isNonAuthoredPath,
  nonAuthoredReason,
};
