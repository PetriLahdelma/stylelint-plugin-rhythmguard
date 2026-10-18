'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { readJsonFile } = require('../core/json');
const { exactScaleCleanliness } = require('./contract');
const { findGitTopLevel } = require('./scan/files');
const { formatPath } = require('./shared');

/**
 * Baseline keys name a finding by what it is, not where it sits: rule, type,
 * file, property (or Tailwind class), value, and the occurrence index among
 * identical findings in that file. Inserting a comment above a declaration no
 * longer turns it into one "resolved" and one "new"; adding a second identical
 * off-scale declaration still counts as new.
 *
 * Version 3 names the file relative to a root that does not move with the
 * working directory: the git top level when the scanned directory is inside a
 * repository, otherwise the scanned directory itself. Version 2 baselines
 * (3.x up to 3.11.0) named it relative to the directory the command ran from;
 * they are read by translating each file to the version 3 form. Version 1
 * baselines keyed by line and column are still compared with the key they
 * were written with.
 */
const BASELINE_FORMAT_VERSION = 3;

const KEY_SEPARATOR = '\u001f';

/**
 * What the run looked at, so a baseline is only judged on files the audit
 * actually read. `scoped` is true for --staged and --since runs.
 */
function createBaselineScope(report, scope = {}) {
  const scanRoot = path.resolve(scope.scanRoot || report.directory || '.');
  let realScanRoot = scanRoot;
  try {
    realScanRoot = fs.realpathSync(scanRoot);
  } catch {
    // The directory was audited, so it exists; keep the given form if not.
  }
  const keyRoot = findGitTopLevel(scanRoot) || realScanRoot;

  // Name a file relative to the key root. Paths under the scanned directory
  // go through its real path, the form git reports the top level in.
  const toKeyFile = (absolutePath) => {
    const insideScan = path.relative(scanRoot, absolutePath);
    const realPath = insideScan.startsWith('..') || path.isAbsolute(insideScan)
      ? absolutePath
      : path.join(realScanRoot, insideScan);
    return path.relative(keyRoot, realPath).split(path.sep).join('/');
  };
  const findingKeyFile = (finding) => toKeyFile(path.resolve(process.cwd(), String(finding.file || '')));
  const toKeyFiles = (files) => new Set((files || []).map((file) => toKeyFile(path.resolve(file))));

  return {
    auditedFiles: toKeyFiles(scope.auditedFiles),
    findingKeyFile,
    scanRoot,
    scoped: scope.scoped === true,
    toKeyFile,
    unauditedFiles: toKeyFiles(scope.unauditedFiles),
  };
}

/**
 * A baseline finding that is no longer reported counts as resolved only when
 * the run audited its file. A --staged or --since run reads the changed files
 * alone, and no run reads a stylesheet that was skipped, ignored or failed to
 * parse, so findings there are neither resolved nor new.
 */
function countsAsResolved(scope, keyFile) {
  return scope.scoped
    ? scope.auditedFiles.has(keyFile)
    : !scope.unauditedFiles.has(keyFile);
}

function applyBaselineComparison(report, baselinePath, scopeInput) {
  const resolvedPath = path.resolve(process.cwd(), baselinePath);
  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`Baseline file not found: ${baselinePath}`);
  }

  const baseline = readBaselineFile(resolvedPath, baselinePath);
  const baselineFindings = Array.isArray(baseline.findings) ? baseline.findings : [];
  const scope = createBaselineScope(report, scopeInput);
  const currentFindings = getAllFindings(report);

  let currentKeys;
  let entries;
  if (isContentKeyed(baseline)) {
    currentKeys = assignFindingKeys(currentFindings, scope.findingKeyFile);
    entries = normalizeBaselineEntries(baseline, scope);
  } else {
    currentKeys = new Map(currentFindings.map((finding) => [finding, createLegacyFindingKey(finding)]));
    entries = baselineFindings.map((finding) => ({
      file: scope.findingKeyFile(finding),
      key: finding.key || createLegacyFindingKey(finding),
    }));
  }

  const baselineKeys = new Set(entries.map((entry) => entry.key));
  const currentKeySet = new Set(currentKeys.values());
  const newFindings = currentFindings.filter((finding) => !baselineKeys.has(currentKeys.get(finding)));
  const resolvedFindings = entries.filter((entry) => !currentKeySet.has(entry.key) && countsAsResolved(scope, entry.file));

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

/**
 * A baseline file as JSON. A parse error names the file, so a corrupt
 * baseline is not reported as a bare `JSON.parse` message (#290).
 */
function readBaselineFile(resolvedPath, baselinePath) {
  try {
    return readJsonFile(resolvedPath);
  } catch (err) {
    throw new Error(`Invalid baseline file ${baselinePath}: ${err.message}`, { cause: err });
  }
}

function writeBaseline(report, baselinePath, scopeInput) {
  const resolvedPath = path.resolve(process.cwd(), baselinePath);
  const scope = createBaselineScope(report, scopeInput);
  const findings = getAllFindings(report);
  const keys = assignFindingKeys(findings, scope.findingKeyFile);
  let records = findings.map((finding) => toBaselineFinding(finding, keys.get(finding), scope.findingKeyFile(finding)));
  let scaleCleanliness = report.scaleCleanliness;

  // A --staged or --since run saw only the changed files. It replaces the
  // entries for the files it audited and keeps every other entry, so a scoped
  // run never shrinks the baseline.
  if (scope.scoped && fs.existsSync(resolvedPath)) {
    const existing = readBaselineFile(resolvedPath, baselinePath);
    if (!isContentKeyed(existing)) {
      throw new Error(`Cannot update ${baselinePath} from a --staged or --since run: it was written with formatVersion 1, keyed by line. Run --write-baseline once without --staged or --since to upgrade it.`);
    }
    const kept = normalizeBaselineEntries(existing, scope)
      .filter((entry) => !scope.auditedFiles.has(entry.file))
      .map((entry) => ({ ...entry.record, file: entry.file, key: entry.key }));
    records = [...kept, ...records].sort((a, b) =>
      String(a.file).localeCompare(String(b.file)) || (a.line || 0) - (b.line || 0) || (a.column || 0) - (b.column || 0));
    if (existing.summary && Number.isFinite(existing.summary.scaleCleanliness)) {
      scaleCleanliness = existing.summary.scaleCleanliness;
    }
  }

  fs.mkdirSync(path.dirname(resolvedPath), { recursive: true });
  fs.writeFileSync(
    resolvedPath,
    `${JSON.stringify({
      createdAt: new Date().toISOString(),
      directory: report.directory,
      findings: records,
      formatVersion: BASELINE_FORMAT_VERSION,
      summary: {
        scaleCleanliness,
        totalFindings: records.length,
      },
    }, null, 2)}\n`,
  );

  report.baselineWritten = {
    file: formatPath(resolvedPath),
    findings: records.length,
  };
}

/** Version 2 and later key findings by content; version 1 (or none) by line. */
function isContentKeyed(baseline) {
  return Number.isInteger(baseline.formatVersion) && baseline.formatVersion >= 2;
}

/**
 * Baseline entries with their file and key in the current form. Version 3
 * entries are already in it. A version 2 file and key are relative to the
 * directory the baseline was written from, which `legacyWriterDirectory` works
 * out; the key keeps its rule, type, property, value and occurrence index and
 * only the file part is rewritten.
 */
function normalizeBaselineEntries(baseline, scope) {
  const findings = Array.isArray(baseline.findings) ? baseline.findings : [];
  if (baseline.formatVersion >= BASELINE_FORMAT_VERSION) {
    return findings.map((record) => ({ file: String(record.file || ''), key: record.key, record }));
  }

  const writerDirectory = legacyWriterDirectory(baseline.directory, scope.scanRoot);
  return findings.map((record) => {
    const file = scope.toKeyFile(path.resolve(writerDirectory, String(record.file || '')));
    const parts = typeof record.key === 'string' ? record.key.split(KEY_SEPARATOR) : [];
    const key = parts.length === 6
      ? [...parts.slice(0, 2), file, ...parts.slice(3)].join(KEY_SEPARATOR)
      : `${findingIdentity(record, file)}${KEY_SEPARATOR}0`;
    return { file, key, record };
  });
}

/**
 * The directory a version 2 baseline was written from. Its files are relative
 * to that directory, and `directory` records the audited directory as it was
 * typed there. When that directory, read from here, is the one being audited,
 * the baseline was written from here (the only case 3.11.0 matched). When it is
 * not, but the audited directory ends with it (`web/src` written from the
 * parent, audited as `./src` from `web`), the baseline was written from the
 * directory that many levels up. Anything else is read as written from here.
 */
function legacyWriterDirectory(directory, scanRoot) {
  const cwd = process.cwd();
  if (typeof directory !== 'string' || directory === '' || path.isAbsolute(directory)) {
    return cwd;
  }
  if (path.resolve(cwd, directory) === scanRoot) {
    return cwd;
  }
  const segments = directory.split(/[\\/]+/).filter((segment) => segment !== '' && segment !== '.');
  if (segments.length === 0 || segments.includes('..')) {
    return cwd;
  }
  const scanSegments = scanRoot.split(path.sep);
  if (scanSegments.slice(-segments.length).join('/') !== segments.join('/')) {
    return cwd;
  }
  return path.resolve(scanRoot, ...segments.map(() => '..'));
}

function getAllFindings(report) {
  return [
    ...report.findings.css,
    ...report.findings.motion,
    ...report.findings.tailwind,
  ];
}

function toBaselineFinding(finding, key, file = finding.file) {
  return {
    column: finding.column,
    file,
    key,
    line: finding.line,
    property: finding.property || undefined,
    rule: finding.rule,
    text: finding.text,
    token: finding.token,
    type: finding.type,
    value: finding.value || finding.rawValue,
  };
}

function findingIdentity(finding, file = finding.file) {
  return [
    finding.rule || '',
    finding.type || '',
    file || '',
    finding.property || finding.token || '',
    finding.value || finding.rawValue || '',
  ].join(KEY_SEPARATOR);
}

/**
 * Content keys for a set of findings: identity plus the occurrence index in
 * source order. `fileOf` names each finding's file in the key (the version 3
 * root-relative form when called from the audit).
 */
function assignFindingKeys(findings, fileOf = (finding) => finding.file) {
  const ordered = [...findings].sort((a, b) =>
    String(a.file).localeCompare(String(b.file)) || (a.line || 0) - (b.line || 0) || (a.column || 0) - (b.column || 0));
  const seen = new Map();
  const keys = new Map();
  for (const finding of ordered) {
    const identity = findingIdentity(finding, fileOf(finding));
    const occurrence = seen.get(identity) || 0;
    seen.set(identity, occurrence + 1);
    keys.set(finding, `${identity}${KEY_SEPARATOR}${occurrence}`);
  }
  return keys;
}

/** The version 1 key: position-based, kept so existing baseline files keep working. */
function createLegacyFindingKey(finding) {
  return [
    finding.rule || '',
    finding.type || '',
    finding.file || '',
    finding.line || '',
    finding.column || '',
    finding.value || finding.rawValue || finding.token || '',
    finding.text || '',
  ].join(KEY_SEPARATOR);
}

function getAuditFailures(report, parsed) {
  const failures = [];

  if (parsed.maxFindings !== null && report.totalWarnings > parsed.maxFindings) {
    failures.push(`total findings ${report.totalWarnings} exceeds --max-findings ${parsed.maxFindings}`);
  }

  // The gate reads the unrounded value: 199 clean files of 200 is 99.5%, which
  // must not pass --min-cleanliness 100.
  if (parsed.minCleanliness !== null && exactScaleCleanliness(report) < parsed.minCleanliness) {
    failures.push(`scale cleanliness ${report.scaleCleanliness}% is below --min-cleanliness ${parsed.minCleanliness}%`);
  }

  if (parsed.failOnNewDrift && report.baseline && report.baseline.newFindingsCount > 0) {
    failures.push(`new drift found: ${report.baseline.newFindingsCount} finding(s) not present in baseline`);
  }

  return failures;
}

module.exports = {
  BASELINE_FORMAT_VERSION,
  applyBaselineComparison,
  assignFindingKeys,
  createBaselineScope,
  createLegacyFindingKey,
  getAllFindings,
  getAuditFailures,
  legacyWriterDirectory,
  writeBaseline,
};
