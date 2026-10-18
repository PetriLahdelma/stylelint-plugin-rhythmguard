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

function scaleFixture() {
  const fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rhythmguard-audit-api-undefined-'));
  // Spacing tokens on a 5px step: scanned-css inference would pick them up.
  fs.writeFileSync(
    path.join(fixtureDir, 'tokens.css'),
    ':root { --space-1: 5px; --space-2: 10px; --space-3: 15px; --space-4: 20px; }\n.a { padding: 13px; margin: var(--space-2); }\n',
  );
  return fixtureDir;
}

test('an option set to undefined is the same as an omitted one (#284)', async () => {
  const dir = scaleFixture();
  const omitted = await createAuditReport({ dir, noConfig: true });
  const undefinedScale = await createAuditReport({ baseFontSize: undefined, dir, noConfig: true, scale: undefined });
  assert.equal(omitted.scale.source, 'default');
  assert.equal(undefinedScale.scale.source, 'default');
  assert.deepEqual(undefinedScale.scale.values, omitted.scale.values);
  assert.equal(undefinedScale.summary.totalFindings, omitted.summary.totalFindings);
});

test('an option set to undefined leaves the config file value in place (#284)', async () => {
  const dir = scaleFixture();
  fs.writeFileSync(path.join(dir, '.rhythmguardrc.json'), JSON.stringify({ audit: { scale: [0, 4, 8, 12, 16] } }));
  const previousCwd = process.cwd();
  try {
    process.chdir(dir);
    const report = await createAuditReport({ dir, scale: undefined });
    assert.equal(report.scale.source, 'explicit');
    assert.deepEqual(report.scale.values, [0, 4, 8, 12, 16]);
    assert.deepEqual(report.config, { file: '.rhythmguardrc.json' });
  } finally {
    process.chdir(previousCwd);
  }
});

/** The members an interface in types/audit.d.ts declares, split into required and optional. */
function declaredMembers(interfaceName) {
  const source = fs.readFileSync(path.join(__dirname, '..', '..', 'types', 'audit.d.ts'), 'utf8');
  const body = source.match(new RegExp(`export interface ${interfaceName} \\{\\n([\\s\\S]*?)\\n\\}`));
  assert.ok(body, `${interfaceName} is declared`);
  const members = [...body[1].matchAll(/^ {2}(\w+)(\?)?:/gm)];
  return {
    optional: members.filter((member) => member[2]).map((member) => member[1]),
    required: members.filter((member) => !member[2]).map((member) => member[1]),
  };
}

test('the audit types declare what createAuditReport returns (#284)', async () => {
  const dir = scaleFixture();
  fs.writeFileSync(path.join(dir, 'view.jsx'), 'export const V = () => <div className="p-[13px]" />;\n');
  const baselinePath = path.join(dir, 'baseline.json');
  await createAuditReport({ baselinePath, dir, noConfig: true, writeBaseline: true });
  fs.writeFileSync(path.join(dir, 'more.css'), '.b { margin: 7px; }\n');
  const report = await createAuditReport({ baselinePath, dir, includeMotion: true, noConfig: true, sinceBaseline: true });

  const checks = [
    ['AuditReport', report],
    ['AuditSummary', report.summary],
    ['AuditScanned', report.scanned],
    ['AuditScanScope', report.scanScope],
    ['AuditScale', report.scale],
    ['AuditBaselineComparison', report.baseline],
    ['AuditFinding', report.findings.css[0]],
    ['AuditFinding', report.findings.tailwind[0]],
  ];
  for (const [name, value] of checks) {
    const { optional, required } = declaredMembers(name);
    for (const key of required) {
      assert.ok(key in value, `${name}.${key} is declared required and present at runtime`);
    }
    for (const key of Object.keys(value)) {
      assert.ok(required.includes(key) || optional.includes(key) || name === 'AuditReport',
        `${name}.${key} exists at runtime and is declared`);
    }
  }
  for (const removed of ['cleanliness', 'filesWithFindings', 'findingCount']) {
    assert.equal(removed in report.summary, false, `summary.${removed} does not exist`);
  }
  assert.equal('message' in report.findings.css[0], false);
  assert.equal('resolvedFindings' in report.baseline, false);
});
