'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {
  AUDIT_JSON_SCHEMA,
  createAuditReport,
  loadAuditConfig,
  parseTokenSources,
  toAuditContractReport,
} = require('../../src/audit');

test('audit API creates reports and v2 contract output', async () => {
  const fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rhythmguard-audit-api-'));
  fs.mkdirSync(path.join(fixtureDir, 'src'));
  fs.writeFileSync(path.join(fixtureDir, 'src', 'card.css'), '.card { padding: 13px; }\n');

  const report = await createAuditReport({
    dir: path.join(fixtureDir, 'src'),
    noConfig: true,
  });
  const contract = toAuditContractReport(report);

  assert.equal(report.formatVersion, 5);
  assert.equal(contract.schemaVersion, '2.0');
  assert.equal(contract.summary.totalFindings, 2);
});

test('audit API exposes config and token-source parsing helpers', () => {
  const fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rhythmguard-audit-api-config-'));
  const previousCwd = process.cwd();
  fs.writeFileSync(
    path.join(fixtureDir, '.rhythmguardrc.json'),
    JSON.stringify({
      audit: {
        tokenSources: ['tokens.json'],
      },
    }),
  );
  fs.writeFileSync(path.join(fixtureDir, 'tokens.json'), JSON.stringify({ '--spacing-4': '16px' }));

  try {
    process.chdir(fixtureDir);
    const config = loadAuditConfig({});
    assert.equal(config.file, '.rhythmguardrc.json');

    const tokenResult = parseTokenSources({
      sources: [{ path: 'tokens.json', baseDir: fixtureDir }],
    });
    assert.equal(tokenResult.definitions.get('--spacing-4').values.has('16px'), true);
    assert.equal(AUDIT_JSON_SCHEMA.properties.schemaVersion.const, '2.0');
  } finally {
    process.chdir(previousCwd);
  }
});
