'use strict';

const fs = require('node:fs');
const path = require('node:path');
const {
  HELP,
  parseArgs,
} = require('../audit/args');
const { getAuditFailures } = require('../audit/baseline');
const { loadAuditConfig } = require('../audit/config');
const {
  AUDIT_JSON_SCHEMA,
  toAuditContractReport,
} = require('../audit/contract');
const { renderGithub } = require('../audit/render-github');
const { renderBadge } = require('../audit/render-badge');
const { renderHtml } = require('../audit/render-html');
const { renderMarkdown } = require('../audit/render-markdown');
const { renderText } = require('../audit/render-text');
const { createAuditReport } = require('../audit/report');

const args = process.argv.slice(3);

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

  if (parsed.schema) {
    writeOutput(`${JSON.stringify(AUDIT_JSON_SCHEMA, null, 2)}\n`, parsed.outputPath);
    return;
  }

  let report;
  try {
    report = await createAuditReport(parsed);
  } catch (err) {
    process.stderr.write(`${err.message}\n`);
    process.exit(1);
  }

  const auditFailures = getAuditFailures(report, parsed);

  if (parsed.format === 'json') {
    writeOutput(`${JSON.stringify(toAuditContractReport(report), null, 2)}\n`, parsed.outputPath);
    finish(auditFailures);
    return;
  }

  if (parsed.format === 'json-v1') {
    writeOutput(`${JSON.stringify(report, null, 2)}\n`, parsed.outputPath);
    finish(auditFailures);
    return;
  }

  if (parsed.format === 'markdown') {
    writeOutput(renderMarkdown(report), parsed.outputPath);
    finish(auditFailures);
    return;
  }

  if (parsed.format === 'html') {
    writeOutput(renderHtml(report), parsed.outputPath);
    finish(auditFailures);
    return;
  }

  if (parsed.format === 'badge') {
    writeOutput(renderBadge(report, { metric: parsed.badgeMetric }), parsed.outputPath);
    finish(auditFailures);
    return;
  }

  if (parsed.format === 'github') {
    writeOutput(renderGithub(report), parsed.outputPath);
    finish(auditFailures);
    return;
  }

  writeOutput(renderText(report), parsed.outputPath);
  finish(auditFailures);
}

function writeOutput(output, outputPath) {
  if (!outputPath) {
    process.stdout.write(output);
    return;
  }

  const resolvedPath = path.resolve(process.cwd(), outputPath);
  fs.mkdirSync(path.dirname(resolvedPath), { recursive: true });
  fs.writeFileSync(resolvedPath, output);
}

function finish(auditFailures) {
  if (auditFailures.length === 0) {
    return;
  }

  process.stderr.write(`Audit failed: ${auditFailures.join('; ')}\n`);
  process.exitCode = 1;
}

module.exports = {
  AUDIT_JSON_SCHEMA,
  createAuditReport,
  loadAuditConfig,
  parseArgs,
  renderBadge,
  renderHtml,
  run,
  toAuditContractReport,
};

if (require.main === module) {
  run();
}
